import React from "react";
import ReactDOM from "react-dom/client";
import "./lib/runtime-polyfills";
import App from "./App";
import "./styles/app.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
