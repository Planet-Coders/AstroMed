/**
 * Curated public-domain photos from the NASA Image and Video Library (images-api.nasa.gov)
 * for the login hero and loading screens. The photos are saved in public/nasa/ (downloaded
 * from images-assets.nasa.gov) so the login never waits on NASA's servers; the server looks
 * up each photo's title and date from the library and caches them for a day.
 */

export type NasaImage = {
  nasaId: string;
  url: string;
  title: string;
  caption: string;
  date: string | null;
  center: string | null;
  /** Where the eye should land when the photo is cropped to the screen. */
  focus: string;
  /** Optional zoom (and its origin) that moves the subject clear of the centred headline. */
  frame?: Frame;
};

type Frame = { scale: number; origin: string };
type Curated = { nasaId: string; caption: string; focus: string; frame?: Frame };

export const LOGIN_IMAGES: Curated[] = [
  {
    nasaId: "art002e021278",
    caption: "Artemis II · Earthset from Orion",
    focus: "50% 50%",
    // Earth sits dead centre in the photo; zoom from the bottom so it rises above the headline.
    frame: { scale: 1.75, origin: "47% 100%" },
  },
  { nasaId: "iss040e062704", caption: "ISS · Earth's limb at night", focus: "50% 60%" },
  {
    nasaId: "art001e001822",
    caption: "Artemis I · Orion with Earth and Moon",
    focus: "50% 50%",
    // Zoom from the bottom-left so Earth clears the headline at the top right.
    frame: { scale: 1.3, origin: "0% 100%" },
  },
  {
    nasaId: "PIA00003",
    caption: "Viking · Mars, Valles Marineris hemisphere",
    focus: "50% 45%",
    // The mosaic has black corners; zoom in enough to fill the screen with Mars.
    frame: { scale: 1.6, origin: "45% 55%" },
  },
];

export const LOADING_IMAGE: Curated = { nasaId: "PIA00003", caption: "Viking · Mars", focus: "50% 45%" };

/** The saved copy of a photo (public/nasa/<id>.jpg, the library's ~large size). */
export const localUrl = (id: string) => `/nasa/${id}.jpg`;

/** The original file in the NASA Image and Video Library. */
export const assetUrl = (id: string, size: "medium" | "large" = "large") =>
  `https://images-assets.nasa.gov/image/${id}/${id}~${size}.jpg`;

/** A curated photo with its caption, before the library's title and date are known. */
export const toImage = (c: Curated): NasaImage => ({
  nasaId: c.nasaId,
  url: localUrl(c.nasaId),
  title: c.caption,
  caption: c.caption,
  date: null,
  center: null,
  focus: c.focus,
  frame: c.frame,
});

const API = "https://images-api.nasa.gov";
const TTL_MS = 24 * 3_600_000;
const cache = new Map<string, { at: number; image: NasaImage }>();

async function resolve(c: Curated): Promise<NasaImage> {
  const hit = cache.get(c.nasaId);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.image;
  const fallback = toImage(c);
  try {
    const meta = await fetch(`${API}/search?nasa_id=${encodeURIComponent(c.nasaId)}`, {
      signal: AbortSignal.timeout(5000),
    }).then((r) => r.json());
    const data = meta.collection.items[0]?.data[0] ?? {};
    const image: NasaImage = {
      ...fallback,
      title: data.title ?? c.caption,
      date: data.date_created ? String(data.date_created).slice(0, 10) : null,
      center: data.center ?? null,
    };
    cache.set(c.nasaId, { at: Date.now(), image });
    return image;
  } catch {
    return fallback;
  }
}

export async function getNasaImages(set: "login" | "loading"): Promise<NasaImage[]> {
  return Promise.all((set === "login" ? LOGIN_IMAGES : [LOADING_IMAGE]).map(resolve));
}
