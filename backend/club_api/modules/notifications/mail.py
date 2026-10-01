import logging
from email.message import EmailMessage

import aiosmtplib

logger = logging.getLogger("club.mail")
EMAIL_CONFIRMATION_KIND = "email_confirmation"


class Notifications:
    def __init__(self, settings, database, client):
        self.settings = settings
        self.database = database
        self.client = client

    @property
    def mail_enabled(self):
        return bool(self.settings.SMTP_HOST)

    async def send_email(self, to, subject, text):
        if not self.mail_enabled:
            logger.warning("SMTP не настроен; письмо не отправлено")
            return False
        message = EmailMessage()
        try:
            message["From"] = self.settings.SMTP_FROM or self.settings.SMTP_USER
            message["To"] = to
            message["Subject"] = subject
            message.set_content(text)
            await aiosmtplib.send(
                message,
                hostname=self.settings.SMTP_HOST,
                port=self.settings.SMTP_PORT,
                username=self.settings.SMTP_USER or None,
                password=self.settings.secret("SMTP_PASS") or None,
                use_tls=self.settings.SMTP_PORT == 465,
                timeout=15,
            )
            return True
        except Exception:
            logger.error("Ошибка доставки письма; содержимое и адрес скрыты")
            return False

    async def enqueue_mail(self, to, subject, body, *, kind="office"):
        id = None
        if self.database.pool:
            try:
                rows = await self.database.rows(
                    "INSERT INTO club_mail_outbox(kind,to_addr,subject,body) VALUES(%s,%s,%s,%s) RETURNING id",
                    (kind, to, subject, body),
                )
                id = rows[0]["id"]
            except Exception:
                logger.error("Не удалось добавить письмо в очередь")
        sent = await self.send_email(to, subject, body)
        if id is not None:
            try:
                if sent:
                    await self.database.execute(
                        "UPDATE club_mail_outbox SET status='sent',attempts=1,sent_at=now(),"
                        "body=CASE WHEN kind=%s THEN '' ELSE body END WHERE id=%s",
                        (EMAIL_CONFIRMATION_KIND, id),
                    )
                else:
                    maximum = self.settings.MAIL_OUTBOX_MAX_ATTEMPTS
                    await self.database.execute(
                        "UPDATE club_mail_outbox SET attempts=1,next_attempt_at=now() + interval '5 minutes',last_error=%s,"
                        "status=CASE WHEN 1 >= %s THEN 'failed' ELSE 'pending' END,"
                        "body=CASE WHEN 1 >= %s AND kind=%s THEN '' ELSE body END WHERE id=%s",
                        (
                            "smtp_fail" if self.mail_enabled else "smtp_missing",
                            maximum,
                            maximum,
                            EMAIL_CONFIRMATION_KIND,
                            id,
                        ),
                    )
            except Exception:
                logger.error("Не удалось записать статус доставки в очередь")
        return {"id": id, "sent": sent, "blocked": not self.mail_enabled}

    async def drain_mail(self, limit=20):
        result = {"sent": 0, "failed": 0, "skipped": 0}
        if not self.database.pool:
            return result
        rows = await self.database.rows(
            "SELECT id,to_addr,subject,body,attempts FROM club_mail_outbox "
            "WHERE status='pending' AND next_attempt_at <= now() ORDER BY id LIMIT %s",
            (limit,),
        )
        for row in rows:
            sent = await self.send_email(row["to_addr"], row["subject"], row["body"])
            attempts = row["attempts"] + 1
            if sent:
                await self.database.execute(
                    "UPDATE club_mail_outbox SET status='sent',attempts=%s,sent_at=now(),last_error=NULL,"
                    "body=CASE WHEN kind=%s THEN '' ELSE body END WHERE id=%s",
                    (attempts, EMAIL_CONFIRMATION_KIND, row["id"]),
                )
                result["sent"] += 1
            elif attempts >= self.settings.MAIL_OUTBOX_MAX_ATTEMPTS:
                await self.database.execute(
                    "UPDATE club_mail_outbox SET status='failed',attempts=%s,last_error='max_attempts',"
                    "body=CASE WHEN kind=%s THEN '' ELSE body END WHERE id=%s",
                    (attempts, EMAIL_CONFIRMATION_KIND, row["id"]),
                )
                result["failed"] += 1
            else:
                await self.database.execute(
                    "UPDATE club_mail_outbox SET attempts=%s,next_attempt_at=now() + (%s * interval '1 minute'),last_error='smtp_fail' WHERE id=%s",
                    (attempts, min(60, 5 * attempts), row["id"]),
                )
                result["skipped"] += 1
        return result

    async def telegram_office(self, text):
        settings = self.settings
        if not settings.secret("OFFICE_TG_BOT_TOKEN") or not settings.OFFICE_TG_CHAT_ID:
            return False
        try:
            response = await self.client.post(
                f"https://api.telegram.org/bot{settings.secret('OFFICE_TG_BOT_TOKEN')}/sendMessage",
                json={"chat_id": settings.OFFICE_TG_CHAT_ID, "text": text},
            )
            return response.is_success and response.json().get("ok") is True
        except Exception:
            return False

    async def office_text(self, text):
        delivered = False
        if self.settings.OFFICE_NOTIFY_CHANNEL in ("email", "both") and self.settings.OFFICE_EMAIL:
            result = await self.enqueue_mail(
                self.settings.OFFICE_EMAIL, "Событие клуба выпускников", text, kind="office_event"
            )
            delivered = result["sent"]
        if self.settings.OFFICE_NOTIFY_CHANNEL in ("telegram", "both"):
            delivered = await self.telegram_office(text) or delivered
        if not delivered:
            logger.warning("Уведомление офиса не доставлено; проверьте канал и очередь")

    async def order_notice(self, number, summary, total, discount):
        text = f"🆕 Новая заявка {number}\n{summary}\nСумма (справочно): {total / 100:g} ₽ (скидка −{discount}%)\nКонтакты и детали – в админ-панели."
        results = []
        if self.settings.OFFICE_NOTIFY_CHANNEL in ("email", "both"):
            if self.settings.OFFICE_EMAIL:
                result = await self.enqueue_mail(
                    self.settings.OFFICE_EMAIL, "Новая заявка " + number, text, kind="office_order"
                )
                results.append({"channel": "email", "ok": result["sent"], "blocked": result["blocked"]})
            else:
                results.append({"channel": "email", "ok": False, "blocked": True})
        if self.settings.OFFICE_NOTIFY_CHANNEL in ("telegram", "both"):
            configured = bool(self.settings.secret("OFFICE_TG_BOT_TOKEN") and self.settings.OFFICE_TG_CHAT_ID)
            results.append({"channel": "telegram", "ok": await self.telegram_office(text), "blocked": not configured})
        return {
            "channel": "+".join(result["channel"] for result in results),
            "ok": all(result["ok"] for result in results),
            "blocked": any(result["blocked"] for result in results),
        }
