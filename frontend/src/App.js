import React from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { SolflareWalletAdapter } from "@solana/wallet-adapter-solflare";
import { Toaster } from "sonner";
import { AuthProvider } from "./AuthContext";
import TopNav from "./components/TopNav";
import MobileTabs from "./components/MobileTabs";
import { LeftRail, RightRail } from "./components/Rails";
import Lobby from "./pages/Lobby";
import Gacha from "./pages/Gacha";
import Breaks from "./pages/Breaks";
import Hits from "./pages/Hits";
import How from "./pages/How";
import Battle from "./pages/Battle";
import Live from "./pages/Live";
import Graildex from "./pages/Graildex";
import BuildBreak from "./pages/BuildBreak";
import Me from "./pages/Me";

import "@solana/wallet-adapter-react-ui/styles.css";

const wallets = [new PhantomWalletAdapter(), new SolflareWalletAdapter()];
const RPC = "https://api.mainnet-beta.solana.com";

export default function App() {
  return (
    <ConnectionProvider endpoint={RPC}>
      <WalletProvider wallets={wallets} autoConnect={false}>
        <WalletModalProvider>
          <AuthProvider>
            <BrowserRouter>
              <TopNav />
              <div className="shell">
                <aside className="rail-l"><LeftRail /></aside>
                <main style={{ minWidth: 0 }}>
                  <Routes>
                    <Route path="/" element={<Lobby />} />
                    <Route path="/gacha" element={<Gacha />} />
                    <Route path="/breaks" element={<Breaks />} />
                    <Route path="/hits" element={<Hits />} />
                    <Route path="/how" element={<How />} />
                    <Route path="/battle" element={<Battle />} />
                    <Route path="/live" element={<Live />} />
                    <Route path="/graildex" element={<Graildex />} />
                    <Route path="/build" element={<BuildBreak />} />
                    <Route path="/me" element={<Me />} />
                    <Route path="*" element={<Lobby />} />
                  </Routes>
                </main>
                <aside className="rail-r"><RightRail /></aside>
              </div>
              <MobileTabs />
              <Toaster position="bottom-right" toastOptions={{
                style: { background: "#121214", border: "1px solid rgba(255,255,255,.08)", color: "#f4f4f2", fontFamily: "Inter, sans-serif" },
              }} />
            </BrowserRouter>
          </AuthProvider>
        </WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
