import { ImageResponse } from "@vercel/og";
import { cleanName, fetchProfile, stats, avatarData, cardTree, missingTree, crew, crewTree } from "../lib/card.js";

export const config = { runtime: "edge" };

const font = (f) => fetch(new URL(`../fonts/${f}`, import.meta.url)).then((r) => r.arrayBuffer());
const FONTS = Promise.all(["inter-500.woff", "inter-800.woff", "mono-400.woff", "mono-700.woff"].map(font));

export default async function handler(req) {
  const url = new URL(req.url);
  const username = cleanName(url.searchParams.get("u"));
  const host = url.host;
  const [i5, i8, m4, m7] = await FONTS;
  const fonts = [
    { name: "Inter", data: i5, weight: 500 }, { name: "Inter", data: i8, weight: 800 },
    { name: "JetBrains Mono", data: m4, weight: 400 }, { name: "JetBrains Mono", data: m7, weight: 700 },
  ];
  let tree, ok = false;
  try {
    const profile = username ? await fetchProfile(username) : null;
    if (profile) {
      if (url.searchParams.get("kind") === "crew") {
        const members = await crew(profile);
        const avatars = await Promise.all(members.map((m) => avatarData(m.avatar_url)));
        tree = crewTree(profile.user, members, { avatars, host });
      } else {
        tree = cardTree(stats(profile), { avatar: await avatarData(profile.user.avatar_url), host });
      }
      ok = true;
    } else tree = missingTree(username, host);
  } catch {
    tree = missingTree(username, host);
  }
  return new ImageResponse(tree, {
    width: 1200, height: 630, fonts,
    headers: { "Cache-Control": ok ? "public, max-age=600, s-maxage=3600, stale-while-revalidate=86400" : "public, max-age=60" },
  });
}
