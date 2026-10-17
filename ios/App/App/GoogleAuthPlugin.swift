import UIKit
import Capacitor
import AuthenticationServices
import Sentry

@objc(HideScoreGoogleAuthPlugin)
public class HideScoreGoogleAuthPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "HideScoreGoogleAuthPlugin"
    public let jsName = "HideScoreGoogleAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "authorize", returnType: CAPPluginReturnPromise)
    ]
    private var authSession: ASWebAuthenticationSession?
    private var pendingCall: CAPPluginCall?

    /// Capacitor runs plugin methods on its "bridge" queue, not main. The
    /// session and its presentation anchor (a UIView's window) are UIKit, and
    /// pendingCall is also touched in the completion on main, so all of it runs
    /// on main (#268, best guess).
    @objc func authorize(_ call: CAPPluginCall) {
        Self.breadcrumb("sign-in requested")
        DispatchQueue.main.async { [weak self] in
            guard let self else { call.reject("authentication unavailable"); return }
            self.startSession(call)
        }
    }

    private func startSession(_ call: CAPPluginCall) {
        guard pendingCall == nil else { call.reject("another sign-in is already in progress"); return }
        guard let raw = call.getString("url"), let url = URL(string: raw),
              url.scheme == "https", ["hidescore.com", "www.hidescore.com"].contains(url.host?.lowercased() ?? ""),
              call.getString("callbackScheme") == "hidescore-auth"
        else { call.reject("invalid authentication URL"); return }
        pendingCall = call
        let session = ASWebAuthenticationSession(url: url, callbackURLScheme: "hidescore-auth") { [weak self] callback, error in
            DispatchQueue.main.async {
                guard let self, let pending = self.pendingCall else { return }
                self.authSession = nil; self.pendingCall = nil
                let nsError = error as NSError?
                Self.breadcrumb("sign-in finished", ["result": callback != nil ? "callback" : "error \(nsError?.code ?? 0)"])
                if let callback { pending.resolve(["callbackUrl": callback.absoluteString]) }
                else {
                    pending.reject(nsError?.code == ASWebAuthenticationSessionError.canceledLogin.rawValue
                        ? "canceled" : (error?.localizedDescription ?? "authentication failed"))
                }
            }
        }
        session.presentationContextProvider = self
        session.prefersEphemeralWebBrowserSession = false
        authSession = session
        let started = session.start()
        Self.breadcrumb(started ? "sign-in session started" : "sign-in session did not start")
        guard started else { authSession = nil; pendingCall = nil; call.reject("could not start authentication session"); return }
    }

    /// One line in the next native crash report (#268). Its Sentry event had
    /// no frame, so these show whether a sign-in was under way and on which
    /// thread each step ran. No URL and no callback: those carry the token.
    private static func breadcrumb(_ message: String, _ data: [String: Any] = [:]) {
        let crumb = Breadcrumb(level: .info, category: "auth.google")
        crumb.message = message
        crumb.data = data.merging(["main_thread": Thread.isMainThread]) { mine, _ in mine }
        SentrySDK.addBreadcrumb(crumb)
    }
}

extension HideScoreGoogleAuthPlugin: ASWebAuthenticationPresentationContextProviding {
    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window
            ?? UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }.first
            ?? ASPresentationAnchor()
    }
}
