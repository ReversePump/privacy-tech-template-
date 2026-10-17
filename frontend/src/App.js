import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import WalletContext from "./solana/WalletContext";
import { AuthProvider } from "./solana/AuthContext";
import Header from "./components/Header";
import Ticker from "./components/Ticker";
import Footer from "./components/Footer";
import Home from "./pages/Home";
import Explore from "./pages/Explore";
import Live from "./pages/Live";
import Launch from "./pages/Launch";
import Mm from "./pages/Mm";
import Docs from "./pages/Docs";
import Desk from "./pages/Desk";
import Dashboard from "./pages/Dashboard";

function App() {
  return (
    <div className="App min-h-screen bg-[#07111f] text-white">
      <WalletContext>
        <AuthProvider>
          <BrowserRouter>
            <Header />
            <Ticker />
            <main>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/explore" element={<Explore />} />
                <Route path="/live" element={<Live />} />
                <Route path="/launch" element={<Launch />} />
                <Route path="/mm" element={<Mm />} />
                <Route path="/token" element={<Navigate to="/" replace />} />
                <Route path="/burn" element={<Navigate to="/" replace />} />
                <Route path="/crown" element={<Navigate to="/" replace />} />
                <Route path="/docs" element={<Docs />} />
                <Route path="/desk/:id" element={<Desk />} />
                <Route path="/coin/:id" element={<CoinRedirect />} />
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/dashboard/:id" element={<Dashboard />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </BrowserRouter>
          <Toaster theme="dark" position="bottom-right" toastOptions={{
            style: { background: "#0d1b2a", border: "1px solid rgba(255,255,255,0.1)", color: "#fff", fontFamily: "Chakra Petch, sans-serif" },
          }} />
        </AuthProvider>
      </WalletContext>
    </div>
  );
}

function CoinRedirect() {
  // upstream uses /coin/<mint> for desk-less coins; route into explore search
  return <Navigate to="/explore" replace />;
}

export default App;
