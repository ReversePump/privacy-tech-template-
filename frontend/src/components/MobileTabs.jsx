import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutGrid, Layers, Package, Plus, MoreHorizontal } from "lucide-react";

const TABS = [
  ["/", "Lobby", LayoutGrid],
  ["/breaks", "Breaks", Layers],
  ["/gacha", "Gacha", Package],
  ["/build", "Build a break", Plus],
  ["/how", "More", MoreHorizontal],
];

export default function MobileTabs() {
  return (
    <nav className="tabbar" data-testid="mobile-tabs">
      {TABS.map(([to, label, Icon]) => (
        <NavLink key={to} to={to} end={to === "/"}
          className={({ isActive }) => `tab${isActive ? " on" : ""}`}
          data-testid={`tab-${label.toLowerCase().replace(/\s+/g, "-")}`}>
          <Icon size={19} strokeWidth={1.8} />
          <span>{label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
