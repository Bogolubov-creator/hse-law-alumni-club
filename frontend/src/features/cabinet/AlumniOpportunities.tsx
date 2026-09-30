const links = [
  ["Центр по работе с выпускниками", "alumni.hse.ru/"],
  ["Карта выпускника", "alumni.hse.ru/propusk_hse"],
  ["Программа лояльности", "alumni.hse.ru/loyalty"],
  ["HSE Alumni Academic Fellowship", "alumni.hse.ru/fellowship"],
  ["HSE Alumni Ambassadors", "alumni.hse.ru/ambassadors"],
  ["HSE Alumni Awards", "alumni.hse.ru/awards"],
];
export default function AlumniOpportunities() {
  return <section id="alumni-opportunities" className="alumni-opportunities" aria-labelledby="alumni-opportunities-title">
    <p className="club-caps">Взаимодействие с выпускниками</p>
    <h2 id="alumni-opportunities-title">Возможности выпускника</h2>
    <p>Сервисы и программы университета. Условия и заявки – на официальных страницах ВШЭ.</p>
    <div className="alumni-opportunities__grid">{links.map(([title,url]) => <a key={url} href={`https://${url}`} target="_blank" rel="noopener noreferrer" className="foc"><span>{title}</span><span aria-hidden="true">↗</span></a>)}</div>
  </section>;
}
