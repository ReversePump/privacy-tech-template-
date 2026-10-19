import React from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import Header from "./components/Header";
import Footer from "./components/Footer";
import WalletContext from "./solana/WalletContext";
import { AuthProvider } from "./solana/AuthContext";
import Home from "./pages/Home";
import New from "./pages/New";
import Strategies from "./pages/Strategies";
import StrategyDetail from "./pages/StrategyDetail";
import Traders from "./pages/Traders";
import Leaderboard from "./pages/Leaderboard";
import Revenue from "./pages/Revenue";
import Account from "./pages/Account";

function App() {
  return (
    <div className="App min-h-screen bg-[#faf9f7] text-[#121214]">
      <WalletContext>
        <AuthProvider>
          <BrowserRouter>
            <Header />
            <main>
              <Routes>
                <Route path="/" element={<Home />} />
                <Route path="/new" element={<New />} />
                <Route path="/strategies" element={<Strategies />} />
                <Route path="/strategies/:id" element={<StrategyDetail />} />
                <Route path="/traders" element={<Traders />} />
                <Route path="/leaderboard" element={<Leaderboard />} />
                <Route path="/revenue" element={<Revenue />} />
                <Route path="/account" element={<Account />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
            <Footer />
          </BrowserRouter>
        </AuthProvider>
      </WalletContext>
      <Toaster position="bottom-right" toastOptions={{
        style: { background: "#ffffff", border: "1px solid #12121414", color: "#121214", fontFamily: "Instrument Sans, sans-serif" },
      }} />
    </div>
  );
}

export default App;
