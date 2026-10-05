import Capacitor
import UIKit
import WebKit

/**
 Capacitor's stock bridge controller leaves WKWebView's edge-swipe gesture off,
 so inside the app there was no way back to the previous screen except hunting
 for an in-page back button. The app is a remote web app, so the web view's own
 history is exactly the right thing to walk. Matches the Android hardware-back
 handler in MainActivity.java.

 It also draws the Scores / Ratings / News tab bar natively (Jacob 9/27: the web
 bar's icons popped iOS's image menu on long-press, and he wanted the stock
 translucent bar). The page stays the source of truth: it tells the bar which
 tab is selected, when to show (board page, phone width, no modal open) and the
 site theme; a tap goes back to the page as a `hs-native-tab` event. The page
 side lives in src/lib/nativeTabBar.ts — it hides the web bar only when this
 shell marks <html> with `data-native-tabbar`, so older app builds keep theirs.
 */
class MainViewController: CAPBridgeViewController, UITabBarDelegate {
    private static let messageName = "hsTabBar"
    private static let views = ["scores-plain", "scores-rated", "news"]

    private let tabBar = UITabBar()
    /// A universal link that arrived before the web view existed (cold start).
    private var pendingURL: URL?
    /// The web view holds its navigation delegate weakly, so the controller keeps it.
    private var navigationRetry: NavigationRetryProxy?

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HideScoreGoogleAuthPlugin())
        installTabBarBridge()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
        if let webView, let capacitor = webView.navigationDelegate {
            let proxy = NavigationRetryProxy(capacitor: capacitor, errorURL: bridge?.config.errorPathURL)
            navigationRetry = proxy
            webView.navigationDelegate = proxy
        }
        setUpTabBar()
        #if DEBUG
        runTabSelfTestIfAsked()
        #endif
        if let url = pendingURL {
            pendingURL = nil
            webView?.load(URLRequest(url: url))
        }
    }

    /// Load a hidescore.com link (universal link, cold or warm start) in the
    /// web view, query string and all, instead of leaving the app on the home
    /// page. The page itself reopens a shared clip from ?hs= / ?c=.
    func open(_ url: URL) {
        guard isViewLoaded, let webView = webView else {
            pendingURL = url
            return
        }
        webView.load(URLRequest(url: url))
    }

    // MARK: - Tab bar

    private func installTabBarBridge() {
        guard let controller = webView?.configuration.userContentController else { return }
        // Before any page script runs, so the web bar never paints first.
        // pagehide: a full navigation away (e.g. to /teams) leaves no page
        // to drive the tabs, so the bar hides until the next board page says so.
        let source = """
        document.documentElement.setAttribute('data-native-tabbar','');
        addEventListener('pagehide',function(){try{webkit.messageHandlers.\(Self.messageName).postMessage({visible:false})}catch(e){}});
        """
        controller.addUserScript(WKUserScript(source: source, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        controller.add(WeakScriptMessageHandler(self), name: Self.messageName)
    }

    private func setUpTabBar() {
        let appearance = UITabBarAppearance()
        appearance.configureWithDefaultBackground()
        tabBar.standardAppearance = appearance
        tabBar.scrollEdgeAppearance = appearance
        // The site's --accent: #2563eb light, #60a5fa dark.
        tabBar.tintColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor(red: 0x60 / 255, green: 0xa5 / 255, blue: 0xfa / 255, alpha: 1)
                : UIColor(red: 0x25 / 255, green: 0x63 / 255, blue: 0xeb / 255, alpha: 1)
        }
        let item = { (title: String, symbol: String, tag: Int) -> UITabBarItem in
            let it = UITabBarItem(title: title,
                                  image: UIImage(systemName: symbol),
                                  selectedImage: UIImage(systemName: symbol + ".fill"))
            it.tag = tag
            it.accessibilityIdentifier = "tab-" + Self.views[tag]
            return it
        }
        tabBar.items = [
            item("Scores", "eye.slash", 0),
            item("Ratings", "star", 1),
            item("News", "newspaper", 2),
        ]
        tabBar.delegate = self
        tabBar.isHidden = true
        tabBar.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(tabBar)
        NSLayoutConstraint.activate([
            tabBar.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            tabBar.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            tabBar.bottomAnchor.constraint(equalTo: view.bottomAnchor),
            tabBar.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -49),
        ])
    }

    func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        let view = Self.views[item.tag]
        webView?.evaluateJavaScript("window.dispatchEvent(new CustomEvent('hs-native-tab',{detail:'\(view)'}))")
    }

    #if DEBUG
    /// Simulator check with no way to tap: `simctl launch <dev> <bundle>
    /// -HSTabSelfTest news` runs the tap path once the page is up. Only the
    /// page's reply moves the selection, so the screenshot proves the round trip.
    private func runTabSelfTestIfAsked() {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-HSTabSelfTest"), i + 1 < args.count,
              let index = Self.views.firstIndex(of: args[i + 1]),
              let item = tabBar.items?[index] else { return }
        DispatchQueue.main.asyncAfter(deadline: .now() + 12) { [weak self] in
            guard let self else { return }
            self.tabBar(self.tabBar, didSelect: item)
        }
    }

    private static let trustedHosts = ["hidescore.com", "www.hidescore.com", "localhost"]
    #else
    private static let trustedHosts = ["hidescore.com", "www.hidescore.com"]
    #endif

    fileprivate func handleTabBarMessage(_ message: WKScriptMessage) {
        guard message.frameInfo.isMainFrame,
              Self.trustedHosts.contains(message.frameInfo.securityOrigin.host),
              let body = message.body as? [String: Any] else { return }
        if let view = body["view"] as? String, let index = Self.views.firstIndex(of: view) {
            tabBar.selectedItem = tabBar.items?[index]
        }
        if let theme = body["theme"] as? String {
            tabBar.overrideUserInterfaceStyle = theme == "dark" ? .dark : .light
        }
        let visible = body["visible"] as? Bool ?? false
        if tabBar.isHidden == visible {
            tabBar.isHidden = !visible
        }
    }
}

/// WKUserContentController keeps its handlers strongly; this breaks the
/// controller → web view → controller cycle.
private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var owner: MainViewController?

    init(_ owner: MainViewController) {
        self.owner = owner
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        owner?.handleTabBarMessage(message)
    }
}

/**
 Capacitor loads offline.html on ANY failed page load, with no retry and no
 offline check (WebViewDelegationHandler didFail / didFailProvisionalNavigation).
 A page load that reuses an idle connection can fail once while the site is
 fine, so 1.0.8 showed "No connection" for most footer taps (Jacob, Oct 5).
 This sits in front of Capacitor's handler and forwards every call, except a
 failed page load:
 - a cancelled load (-999, or WebKit 102: a newer navigation or the policy
   check took over) is not a failure, so it is dropped;
 - a timeout or "not connected" goes straight to Capacitor (a retry would
   only make the wait longer);
 - any other failure of an http(s) page retries the same URL once, 300 ms
   later, on a new request, unless another navigation started meanwhile;
 - a second failure for that URL shows offline.html?from=<url>, so its
   Try again goes back to the page that failed instead of the board.
 */
final class NavigationRetryProxy: NSObject, WKNavigationDelegate {
    private let capacitor: WKNavigationDelegate
    private let errorURL: URL?
    /// The URL already retried once; cleared when any page finishes loading.
    private var retried: URL?
    /// Bumped by every navigation start and finish, so a pending retry can
    /// tell that the reader tapped something else in the 300 ms.
    private var generation = 0

    init(capacitor: WKNavigationDelegate, errorURL: URL?) {
        self.capacitor = capacitor
        self.errorURL = errorURL
    }

    // WebKit asks which delegate methods exist when the delegate is set, so
    // everything Capacitor answers has to look answered here too.
    override func responds(to aSelector: Selector!) -> Bool {
        super.responds(to: aSelector) || capacitor.responds(to: aSelector)
    }

    override func forwardingTarget(for aSelector: Selector!) -> Any? {
        capacitor.responds(to: aSelector) ? capacitor : nil
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        generation += 1
        capacitor.webView?(webView, didStartProvisionalNavigation: navigation)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        generation += 1
        retried = nil
        capacitor.webView?(webView, didFinish: navigation)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        if handled(webView, error) { return }
        capacitor.webView?(webView, didFail: navigation, withError: error)
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if handled(webView, error) { return }
        capacitor.webView?(webView, didFailProvisionalNavigation: navigation, withError: error)
    }

    /// true = dealt with here (dropped, retried, or sent to offline.html?from=);
    /// false = Capacitor's own handler runs.
    private func handled(_ webView: WKWebView, _ error: Error) -> Bool {
        let e = error as NSError
        if (e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled) || (e.domain == "WebKitErrorDomain" && e.code == 102) {
            CAPLog.print("⚡️  WebView load cancelled (\(e.domain) \(e.code)), ignored")
            return true
        }
        let noRetry = [NSURLErrorTimedOut, NSURLErrorNotConnectedToInternet,
                       NSURLErrorInternationalRoamingOff, NSURLErrorDataNotAllowed]
        guard e.domain != NSURLErrorDomain || !noRetry.contains(e.code),
              let url = e.userInfo[NSURLErrorFailingURLErrorKey] as? URL,
              url.scheme == "https" || url.scheme == "http" else { return false }
        if retried != url {
            retried = url
            let at = generation
            CAPLog.print("⚡️  WebView load failed (\(e.code)), retrying once: \(url.absoluteString)")
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) { [weak self, weak webView] in
                guard let self, self.generation == at else { return }
                webView?.load(URLRequest(url: url))
            }
            return true
        }
        retried = nil
        // Escaped by hand: URLQueryItem leaves "+" alone, and offline.html's
        // URLSearchParams would read it as a space.
        var allowed = CharacterSet.urlQueryAllowed
        allowed.remove(charactersIn: "+&=#")
        guard let errorURL, var parts = URLComponents(url: errorURL, resolvingAgainstBaseURL: false),
              let from = url.absoluteString.addingPercentEncoding(withAllowedCharacters: allowed) else { return false }
        parts.percentEncodedQuery = "from=" + from
        guard let offline = parts.url else { return false }
        CAPLog.print("⚡️  WebView failed to load twice (\(e.code)): \(url.absoluteString)")
        webView.load(URLRequest(url: offline))
        return true
    }
}
