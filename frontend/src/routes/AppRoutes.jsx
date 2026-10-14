import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";

import { useEffect } from "react";

import RoleSelection from "../pages/auth/RoleSelection";
import StaffLogin from "../pages/auth/StaffLogin";

import UserLayout from "../layouts/UserLayout";
import AdminLayout from "../layouts/AdminLayout";

import UserHome from "../pages/user/UserHome";
import CrowdAreas from "../pages/user/CrowdAreas";
import Navigation from "../pages/user/Navigation";
import LiveMap from "../pages/user/LiveMap";
import RecommendedRoute from "../pages/user/RecommendedRoute";
import Entries from "../pages/user/Entries";
import Exits from "../pages/user/Exits";
import UserAlerts from "../pages/user/Alerts";
import Profile from "../pages/user/Profile";

import AdminDashboard from "../pages/admin/AdminDashboard";
import CrowdMonitoring from "../pages/admin/CrowdMonitoring";
import CameraMonitoring, {
  DroneMonitoring,
} from "../pages/admin/CameraMonitoring";
import AdminMap from "../pages/admin/AdminMap";
import Prediction from "../pages/admin/Prediction";
import HourlyCrowdForecast from "../pages/admin/HourlyCrowdForecast";
import CivicSense from "../pages/admin/CivicSense";
import StaffAssignments from "../pages/admin/StaffAssignments";
import EntryExit from "../pages/admin/EntryExit";
import AdminAlerts from "../pages/admin/Alerts";
import Resources from "../pages/admin/Resorces";
import Analytics from "../pages/admin/Analytics";
import StaffProfile from "../pages/admin/StaffProfile";

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}

function AppRoutes() {
  return (
    <BrowserRouter>
      <ScrollToTop />

      <Routes>

        {/* Landing / Role Selection */}
        <Route
          path="/"
          element={<RoleSelection />}
        />

        {/* Devotee / User App */}
        <Route path="/user" element={<UserLayout />}>
          <Route index element={<UserHome />} />
          <Route path="crowd" element={<CrowdAreas />} />
          <Route path="navigation" element={<Navigation />} />
          <Route path="map" element={<LiveMap />} />
          <Route path="route" element={<RecommendedRoute />} />
          <Route path="entries" element={<Entries />} />
          <Route path="exits" element={<Exits />} />
          <Route path="alerts" element={<UserAlerts />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Staff / Admin */}
        <Route path="/admin-login" element={<StaffLogin />} />

        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<AdminDashboard />} />
          <Route path="crowd" element={<CrowdMonitoring />} />
          <Route path="cameras" element={<CameraMonitoring />} />
          <Route path="drones" element={<DroneMonitoring />} />
          <Route path="map" element={<AdminMap />} />
          <Route path="prediction" element={<Prediction />} />
          <Route path="hourly-crowd" element={<HourlyCrowdForecast />}/>
          <Route path="civic-sense" element={<CivicSense />} />
          <Route path="staff" element={<StaffAssignments />} />
          <Route path="entry-exit" element={<EntryExit />} />
          <Route path="alerts" element={<AdminAlerts />} />
          <Route path="resources" element={<Resources />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="profile" element={<StaffProfile />} />
        </Route>

        {/* Unknown routes */}
        <Route path="*" element={<Navigate to="/" replace />} />

      </Routes>

    </BrowserRouter>
  );
}

export default AppRoutes;
