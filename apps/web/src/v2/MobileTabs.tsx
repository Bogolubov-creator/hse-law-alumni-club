import { ClubTabBar } from "../mobile/ClubTabBar.js";

/**
 * Нижняя панель на канон-страницах (Shell, кабинет, гейты ЛК).
 * Тот же набор пунктов, что у MobileApp – см. ClubTabBar.
 */
export function MobileTabs() {
  return <ClubTabBar variant="fixed" />;
}
