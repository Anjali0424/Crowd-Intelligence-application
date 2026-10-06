import { Outlet } from "react-router-dom";

import Header from "../components/common/Header";
import BottomNav from "../components/common/BottomNav";

function UserLayout() {
  return (
    <div className="user-page">
      <div className="user-container">

        <Header />

        <main className="user-content">
          <Outlet />
        </main>

        <BottomNav />

      </div>
    </div>
  );
}

export default UserLayout;
