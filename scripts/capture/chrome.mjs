import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
export async function launchChrome() {
  const profile = await mkdtemp(join(tmpdir(), "honk-capture-chrome-"));
  const binary =
    process.env.CHROME_BIN ||
    (process.platform === "darwin"
      ? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
      : "google-chrome");
  const child = spawn(
    binary,
    [
      "--headless=new",
      `--user-data-dir=${profile}`,
      "--remote-debugging-port=0",
      "--no-first-run",
      "--no-default-browser-check",
      "--autoplay-policy=no-user-gesture-required",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
      "--disable-backgrounding-occluded-windows",
      ...(process.env.CAPTURE_SOFTWARE_GL === "0"
        ? []
        : ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"]),
      "about:blank",
    ],
    { stdio: "ignore" },
  );
  let launchError;
  child.on("error", (error) => {
    launchError = error;
  });
  let port;
  for (let i = 0; i < 100; i++) {
    if (launchError) throw launchError;
    try {
      port = Number(
        (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split(
          "\n",
        )[0],
      );
      break;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!port) {
    child.kill();
    throw new Error(
      "Chrome did not expose its local debugging port. Set CHROME_BIN to an installed Chrome executable.",
    );
  }
  const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) =>
    r.json(),
  );
  const ws = new WebSocket(
      pages.find((p) => p.type === "page").webSocketDebuggerUrl,
    ),
    pending = new Map();
  let next = 0;
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  const errors = [],
    network = [];
  ws.onmessage = ({ data }) => {
    const message = JSON.parse(data);
    if (message.id) {
      const promise = pending.get(message.id);
      pending.delete(message.id);
      if (promise)
        message.error
          ? promise.reject(new Error(JSON.stringify(message.error)))
          : promise.resolve(message.result);
    } else if (message.method === "Runtime.exceptionThrown")
      errors.push(
        message.params.exceptionDetails.exception?.description ||
          message.params.exceptionDetails.text,
      );
    else if (message.method === "Network.requestWillBeSent")
      network.push(message.params.request.url);
  };
  ws.onclose = () => {
    for (const p of pending.values())
      p.reject(new Error("Chrome connection closed."));
  };
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++next;
      pending.set(id, { resolve, reject });
      ws.send(JSON.stringify({ id, method, params }));
    });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 1050,
    deviceScaleFactor: 1,
    mobile: false,
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
      timeout: 180000,
    });
    if (result.exceptionDetails)
      throw new Error(
        result.exceptionDetails.exception?.description ||
          result.exceptionDetails.text,
      );
    return result.result.value;
  };
  return {
    send,
    evaluate,
    errors,
    network,
    navigate: async (url) => {
      await send("Page.navigate", { url });
      await new Promise((r) => setTimeout(r, 500));
    },
    close: async () => {
      ws.close();
      child.kill();
      await new Promise((r) => setTimeout(r, 300));
      await rm(profile, { recursive: true, force: true }).catch(() => {});
    },
  };
}
