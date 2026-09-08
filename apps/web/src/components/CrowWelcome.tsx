import { useEffect, useRef, useState } from 'react';
import { crowRig } from './crow-rig.js';
import { mascot } from '../config/mascot.js';
import '../styles/crow.css';

/** Одно приветствие; повтор запускает посетитель. Геометрия рисунка сохранена. */
export function CrowWelcome() {
  const root = useRef<HTMLDivElement>(null);
  const [reduced, setReduced] = useState(true);
  const [disabled, setDisabled] = useState(false);
  const [visible, setVisible] = useState(true);
  const [pageVisible, setPageVisible] = useState(true);
  const [take, setTake] = useState(0);
  useEffect(() => {
    const preference = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(preference.matches);
    const visibility = () => setPageVisible(!document.hidden);
    update(); visibility();
    preference.addEventListener('change', update);
    document.addEventListener('visibilitychange', visibility);
    const observer = new IntersectionObserver(entries => setVisible(entries[0]?.isIntersecting ?? false));
    if (root.current) observer.observe(root.current);
    return () => {
      preference.removeEventListener('change', update);
      document.removeEventListener('visibilitychange', visibility);
      observer.disconnect();
    };
  }, []);
  const animate = !reduced && !disabled;
  return <div ref={root} className="crow-welcome" data-motion={animate ? 'on' : 'off'}>
    <div className="crow-illustration" role="img" aria-label={mascot.alt}>
      <span className="crow-halo" aria-hidden="true" />
      {animate ? <div key={take} aria-hidden="true" className="crow-rig" style={{ animationPlayState: visible && pageVisible ? 'running' : 'paused' }} dangerouslySetInnerHTML={{ __html: crowRig }} /> : <img className="crow-rest" src={mascot.hero} alt="" width="1400" height="1465" />}
    </div>
    <div className="crow-welcome-copy"><p>Рады видеть своих</p><span>Встречи, знания и связи после выпуска</span>
      {!reduced && <div className="crow-controls"><button type="button" className="foc" disabled={disabled} onClick={() => setTake(value => value + 1)}>Помахать в ответ</button><button type="button" className="foc" aria-pressed={disabled} onClick={() => setDisabled(value => !value)}>{disabled ? 'Включить движение' : 'Без движения'}</button></div>}
    </div>
  </div>;
}
