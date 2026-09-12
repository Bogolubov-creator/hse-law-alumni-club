import { Link, useNavigate } from "react-router-dom";
import { isAuthError, rub } from "../lib/api.js";
import { clearToken } from "../lib/cart.js";
import { useMe, useMyOrders, usePaymentsEnabled, useSubscribePodcasts } from "../lib/queries.js";
import { action, actionGhost } from "../styles/primitives.js";
import "../styles/podcast-subscription.css";

const loginUrl = "/lk?next=%2Fpodcasts%23podcast-subscription";

/** Оформление опирается на статус профиля и заявки из API. */
export function PodcastSubscription({ token, price }: { token: string | null; price: number }) {
  const me = useMe(token);
  const verified = me.data?.alumni.verification_status === "verified";
  const orders = useMyOrders(verified ? token : null);
  const payments = usePaymentsEnabled();
  const subscribe = useSubscribePodcasts(token);
  const navigate = useNavigate();
  const existing = orders.data?.find(order => order.type === "podcast"
    && ["new", "in_progress"].includes(order.status)
    && !["succeeded", "canceled"].includes(order.payment_status ?? ""));
  const number = subscribe.data?.number ?? existing?.number;
  const rejected = me.data?.alumni.verification_status === "rejected";
  const email = me.data?.alumni.contacts?.email;
  const submit = () => subscribe.mutate(undefined, {
    onSuccess: result => { if (result.payment_url) window.location.assign(result.payment_url); },
  });

  return <section id="podcast-subscription" tabIndex={-1} className="podcast-subscription" aria-labelledby="podcast-subscription-title">
    <div className="podcast-subscription__intro">
      <h2 id="podcast-subscription-title">Все выпуски на год</h2>
      <p>Подписка на 12 месяцев с момента открытия доступа.</p>
      <strong className="podcast-subscription__price">{rub(price)} <span>/ год</span></strong>
    </div>
    <div className="podcast-subscription__steps">
      {!token ? <>
        <h3>Начните со входа</h3>
        <p>Подписка доступна выпускникам после подтверждения учебным офисом. Войдите, чтобы продолжить оформление.</p>
        <Link className="foc" style={action} to={loginUrl}>Войти в кабинет</Link>
      </> : me.isPending ? <p role="status">Проверяем статус выпускника…</p>
      : me.isError ? <>
        <p role="alert">{isAuthError(me.error) ? "Сессия завершилась. Войдите снова, чтобы продолжить." : "Не удалось проверить профиль. Повторите попытку."}</p>
        <button className="foc" style={actionGhost} onClick={() => {
          if (isAuthError(me.error)) { clearToken(); navigate(loginUrl); }
          else void me.refetch();
        }}>{isAuthError(me.error) ? "Войти снова" : "Повторить проверку"}</button>
      </> : !verified ? <>
        <h3>{rejected ? "Нужно подтвердить выпуск" : "Выпуск на проверке"}</h3>
        <p>{rejected ? "Учебный офис пока не подтвердил ваш выпуск. Обратитесь в поддержку, чтобы уточнить данные." : "Учебный офис сверяет данные с реестром факультета. Оформление подписки станет доступно после подтверждения."}</p>
        <p>Пробный выпуск можно слушать уже сейчас.</p>
        <Link className="foc" style={actionGhost} to={rejected ? "/support" : "/lk"}>{rejected ? "Написать в поддержку" : "Посмотреть статус"}</Link>
      </> : number ? <>
        <h3>Заявка {number}</h3>
        <p role="status">{payments.data?.enabled ? "Заявка сохранена. Доступ откроется после подтверждения оплаты." : "Заявка у учебного офиса. С вами свяжутся для согласования оплаты и открытия доступа."}</p>
        <Link className="foc" style={actionGhost} to="/lk?section=orders">Посмотреть заявку</Link>
        {payments.data?.enabled && <button className="foc" style={action} disabled={subscribe.isPending} onClick={submit}>{subscribe.isPending ? "Открываем…" : "Продолжить оформление"}</button>}
      </> : orders.isPending || payments.isPending ? <p role="status">Проверяем условия оформления…</p>
      : orders.isError || payments.isError ? <>
        <p role="alert">Не удалось проверить условия оформления. Повторите попытку.</p>
        <button className="foc" style={actionGhost} onClick={() => { void orders.refetch(); void payments.refetch(); }}>Повторить проверку</button>
      </> : <>
        <h3>{payments.data?.enabled ? "Оформить подписку" : "Заявка в учебный офис"}</h3>
        <p>{payments.data?.enabled ? "После отправки заявки откроется страница оплаты." : "Отправьте заявку. Учебный офис свяжется с вами и согласует оплату. Доступ откроется после её подтверждения."}</p>
        {email && <p>Почта для связи: <strong>{email}</strong>. <Link className="foc" to="/lk/profile">Изменить</Link></p>}
        <button className="foc" style={action} disabled={subscribe.isPending} onClick={submit}>{subscribe.isPending ? "Отправляем…" : payments.data?.enabled ? "Перейти к оформлению" : "Отправить заявку на подписку"}</button>
      </>}
      {subscribe.isError && <p role="alert">{(subscribe.error as Error).message}</p>}
    </div>
  </section>;
}
