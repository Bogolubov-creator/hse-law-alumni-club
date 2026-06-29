import { Routes, Route } from "react-router-dom";
import Home from "./pages/Home.js";
import News from "./pages/News.js";
import NewsPost from "./pages/NewsPost.js";
import Stub from "./pages/Stub.js";
import Lk from "./pages/Lk.js";
import Profile from "./pages/Profile.js";
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
      <Route path="/dpo" element={<Stub title="Витрина ДПО" />} />
      <Route path="/merch" element={<Stub title="Витрина мерча" />} />
      <Route path="/cart" element={<Stub title="Корзина" />} />
      <Route path="/checkout" element={<Stub title="Оформление заявки" />} />
      <Route path="*" element={<Stub title="Страница не найдена" />} />
    </Routes>
  );
}
