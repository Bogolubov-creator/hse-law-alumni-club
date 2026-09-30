// @vitest-environment happy-dom
import { expect, it, vi } from "vitest";
vi.mock("../public-url.js", () => ({ isMirror: false }));
import { mirrorPodcastDemo, setMirrorPodcastDemo } from "../mirror-podcast-demo.js";

it("переключатель зеркала не открывает доступ в обычной сборке", () => {
  sessionStorage.setItem("club_mirror_podcast_demo", "subscriber");
  expect(mirrorPodcastDemo()).toBe(false);
  setMirrorPodcastDemo(true);
  expect(mirrorPodcastDemo()).toBe(false);
  sessionStorage.clear();
});
