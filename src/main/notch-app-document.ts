import { randomBytes } from "node:crypto";

export const NOTCH_APP_CSP =
	"default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; worker-src 'none'";

function scriptJson(value: unknown): string {
	return JSON.stringify(value)
		.replaceAll("<", "\\u003c")
		.replaceAll("\u2028", "\\u2028")
		.replaceAll("\u2029", "\\u2029");
}

/** Trusted parent and untrusted child deliberately never share an origin or JavaScript context. */
export function notchAppDocument(options: { html: string; title: string; close: string; preview: boolean }): string {
	const nonce = randomBytes(24).toString("base64url");
	const childSdk = `(() => {
		// WebRTC data channels can bypass connect-src; remove both constructors before app code.
		for (const name of ['RTCPeerConnection', 'webkitRTCPeerConnection']) {
			Object.defineProperty(window, name, {value: undefined, writable: false, configurable: false});
		}
		let port;
		let sequence = 0;
		const pending = new Map();
		const connection = Promise.withResolvers();
		window.addEventListener('message', event => {
			if (event.source !== parent || event.data !== ${scriptJson(nonce)} || port || !event.ports[0]) return;
			port = event.ports[0];
			port.onmessage = ({data}) => {
				const call = pending.get(data.id);
				if (!call) return;
				pending.delete(data.id);
				data.error ? call.reject(new Error(data.error)) : call.resolve(data.result);
			};
			connection.resolve();
		});
		Object.defineProperty(window, 'wisa', {value: Object.freeze({
			async request(name, args = {}) {
				if (typeof name !== 'string' || pending.size >= 32) throw new Error('Invalid or excessive requests');
				await connection.promise;
				const call = Promise.withResolvers();
				const id = ++sequence;
				pending.set(id, call);
				try { port.postMessage({id, name, args}); }
				catch (error) { pending.delete(id); call.reject(error); }
				return call.promise;
			}
		})});
		parent.postMessage(${scriptJson(nonce)}, '*');
	})();`;
	const child = `<!doctype html><meta charset="utf-8"><meta http-equiv="x-dns-prefetch-control" content="off"><meta http-equiv="Content-Security-Policy" content="${NOTCH_APP_CSP}"><script>${childSdk}</script>${options.html}`;
	// srcdoc inherits this policy; its own CSP tightens frame-src to none. Never interpolate source into host script.
	const hostCsp =
		"default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; frame-src about:; child-src about:; object-src 'none'; base-uri 'none'; form-action 'none'; connect-src 'none'; worker-src 'none'";
	return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${hostCsp}"><style nonce="${nonce}">
		*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:transparent;color:#fff;font:12px system-ui}
		main{height:100%;border-radius:0 0 18px 18px;overflow:hidden;background:#111c;display:flex;flex-direction:column;border:1px solid #ffffff35}
		header{height:36px;min-height:36px;display:flex;align-items:center;gap:8px;padding:0 10px;background:#181818;isolation:isolate}
		span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}button{border:1px solid #777;border-radius:6px;background:#333;color:#fff;padding:3px 8px;cursor:pointer}iframe{border:0;flex:1;width:100%;min-height:0;background:transparent}
		</style></head><body><main><header><span id="title"></span><button id="close" type="button"></button></header><iframe sandbox="allow-scripts" referrerpolicy="no-referrer" allow="camera 'none'; microphone 'none'; geolocation 'none'; clipboard-read 'none'; clipboard-write 'none'; display-capture 'none'" title="Mini-app"></iframe></main><script nonce="${nonce}">
		const frame = document.querySelector('iframe');
		document.getElementById('title').textContent = ${scriptJson(options.title)};
		document.getElementById('close').textContent = ${scriptJson(options.close)};
		document.getElementById('close').onclick = () => window.notchHost.request(${scriptJson(options.preview ? "host.revert" : "host.stop")});
		let connected = false;
		window.addEventListener('message', event => {
			if (event.source !== frame.contentWindow || event.data !== ${scriptJson(nonce)} || connected) return;
			connected = true;
			const channel = new MessageChannel();
			channel.port1.onmessage = async ({data}) => {
				if (!data || !Number.isSafeInteger(data.id) || typeof data.name !== 'string') return;
				if (data.name.startsWith('host.')) { channel.port1.postMessage({id: data.id, error: 'Reserved host request'}); return; }
				try { channel.port1.postMessage({id: data.id, result: await window.notchHost.request(data.name, data.args)}); }
				catch (error) { channel.port1.postMessage({id: data.id, error: String(error.message || error)}); }
			};
			frame.contentWindow.postMessage(${scriptJson(nonce)}, '*', [channel.port2]);
		});
		window.notchHost.ready().then(() => { frame.srcdoc = ${scriptJson(child)}; });
		</script></body></html>`;
}
