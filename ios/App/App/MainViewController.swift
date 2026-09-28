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

    override func capacitorDidLoad() {
        bridge?.registerPluginInstance(HideScoreGoogleAuthPlugin())
        installTabBarBridge()
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        webView?.allowsBackForwardNavigationGestures = true
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
