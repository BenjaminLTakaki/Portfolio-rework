// Build-time HTML of the pages meant to be found (scripts/prerender.js), so crawlers, link previews and visitors
// without JavaScript get the content. In the browser src/main.jsx still mounts the app over it.
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";
import App from "./App";

export const render = (url) => renderToString(<StaticRouter location={url}><App /></StaticRouter>);
