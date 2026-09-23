import { useEffect, useState } from "react";
import { rememberReading, toggleSaved, useReading, type ReadingItem } from "../lib/reading-list.js";
import "../styles/reading-list.css";
export default function SaveMaterial({ item }: { item: Omit<ReadingItem, "at"> }) {
  const { saved, unavailable } = useReading();
  useEffect(() => { rememberReading({ ...item, at: Date.now() }); }, [item.kind, item.id, item.path, item.title]);
  const [error, setError] = useState(false);
  const exists = saved.some(i => i.path === item.path);
  return <div className="reading-save"><button className="foc reading-button" aria-pressed={exists} onClick={() => setError(!toggleSaved({ ...item, at: Date.now() }))}>{exists ? "Сохранено" : "Сохранить"}</button>
    {(error || unavailable) && <span role="alert">Не удалось сохранить. Проверьте доступ к хранилищу браузера и количество сохранённых материалов (до 200).</span>}
  </div>;
}
