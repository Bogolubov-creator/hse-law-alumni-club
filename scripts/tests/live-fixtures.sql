INSERT INTO club_news_inbox(id,source_url,sources,title,published_at)
VALUES
  (repeat('a',63)||'1','https://pravo.hse.ru/news/1000000001.html',ARRAY['alumni'],'Скрыть новость desktop',now()),
  (repeat('a',63)||'2','https://pravo.hse.ru/news/1000000002.html',ARRAY['alumni'],'Опубликовать новость desktop',now()),
  (repeat('b',63)||'1','https://pravo.hse.ru/news/1000000003.html',ARRAY['alumni'],'Скрыть новость mobile',now()),
  (repeat('b',63)||'2','https://pravo.hse.ru/news/1000000004.html',ARRAY['alumni'],'Опубликовать новость mobile',now());
INSERT INTO club_news_source_runs(source,error)
VALUES ('alumni','Тестовая ошибка загрузки источника');
