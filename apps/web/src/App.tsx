import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.js";
import News from "./pages/News.js";
import NewsPost from "./pages/NewsPost.js";
import Stub from "./pages/Stub.js";
import Lk from "./pages/Lk.js";
import Profile from "./pages/Profile.js";
import Dpo from "./pages/Dpo.js";
import Program from "./pages/Program.js";
import Merch from "./pages/Merch.js";
import Cart from "./pages/Cart.js";
import AdminApp from "./admin/AdminApp.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/news" element={<News />} />
      <Route path="/news/:slug" element={<NewsPost />} />
      <Route path="/admin/*" element={<AdminApp />} />
      <Route path="/lk" element={<Lk />} />
      <Route path="/lk/profile" element={<Profile />} />
      <Route path="/dpo" element={<Dpo />} />
      <Route path="/dpo/:slug" element={<Program />} />
      <Route path="/merch" element={<Merch />} />
      <Route path="/cart" element={<Cart />} />
      <Route path="*" element={<Stub title="Страница не найдена" />} />
    </Routes>
  );
}
