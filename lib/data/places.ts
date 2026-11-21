import "server-only";

import { reportDataAccessError } from "@/lib/network-errors";
import { createClient } from "@supabase/supabase-js";
import type { Listing, VerificationStatus } from "@/lib/types";
import { hasPublishablePhotoRights } from "@/lib/media/photo-rights";
import { supabaseServerFetch } from "@/lib/supabase/fetch";

export type PlaceRow = {
  id: string;
  slug: string;
  place_type: string;
  name: string;
  short_description: string;
  primary_category: string;
  neighbourhood: string | null;
  price_level: number | null;
  cuisine_primary: string | null;
  open_status: string;
  weekly_hours: unknown;
  verification_status: VerificationStatus;
  warning_message: string | null;
  source_checked_at: string | null;
  image_url: string | null;
  image_rights_notes: string | null;
  latitude: number;
  longitude: number;
};

type TimeInterval = {
  open: number;
  close: number;
};

type ParsedDayHours = {
  recognized: boolean;
  intervals: TimeInterval[];
};

const WINNIPEG_TIMEZONE = "America/Winnipeg";

const weekdayOrder = [
  "sunday",
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
] as const;

function getPublicSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();

  const publishableKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();

  if (!url || !publishableKey) {
    throw new Error("Supabase public environment variables are missing.");
  }

  return createClient(url, publishableKey, {
    global: {
      fetch: supabaseServerFetch,
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

function getPriceLabel(priceLevel: number | null): string {
  if (!priceLevel) {
    return "Price unavailable";
  }

  return "$".repeat(priceLevel);
}

function parseTimeToMinutes(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }

  const match = value.match(/^(\d{1,2}):(\d{2})$/);

  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);

  if (minute < 0 || minute > 59 || hour < 0 || hour > 24) {
    return null;
  }

  if (hour === 24 && minute !== 0) {
    return null;
  }

  return hour * 60 + minute;
}

function parseDayHours(value: unknown): ParsedDayHours {
  if (Array.isArray(value)) {
    const parsedItems = value.map(parseDayHours);

    return {
      recognized:
        parsedItems.length === 0 || parsedItems.some((item) => item.recognized),

      intervals: parsedItems.flatMap((item) => item.intervals),
    };
  }

  if (!value || typeof value !== "object") {
    return {
      recognized: false,
      intervals: [],
    };
  }

  const day = value as Record<string, unknown>;

  if (day.closed === true) {
    return {
      recognized: true,
      intervals: [],
    };
  }

  const open = parseTimeToMinutes(day.open);

  const close = parseTimeToMinutes(day.close);

  if (open === null || close === null) {
    return {
      recognized: false,
      intervals: [],
    };
  }

  return {
    recognized: true,
    intervals: [
      {
        open,
        close,
      },
    ],
  };
}

function normalizeWeeklyHours(
  weeklyHours: unknown,
): Record<string, unknown> | null {
  if (typeof weeklyHours === "string") {
    try {
      const parsed = JSON.parse(weeklyHours);

      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return null;
    }
  }

  if (
    weeklyHours &&
    typeof weeklyHours === "object" &&
    !Array.isArray(weeklyHours)
  ) {
    return weeklyHours as Record<string, unknown>;
  }

  return null;
}

function getWinnipegTime(): {
  weekday: string;
  minutes: number;
} {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: WINNIPEG_TIMEZONE,
    weekday: "long",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const weekday =
    parts.find((part) => part.type === "weekday")?.value.toLowerCase() ??
    "monday";

  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);

  const minute = Number(
    parts.find((part) => part.type === "minute")?.value ?? 0,
  );

  return {
    weekday,
    minutes: hour * 60 + minute,
  };
}

function getPreviousWeekday(weekday: string): string {
  const weekdayIndex = weekdayOrder.indexOf(
    weekday as (typeof weekdayOrder)[number],
  );

  if (weekdayIndex === -1) {
    return "sunday";
  }

  return weekdayOrder[(weekdayIndex - 1 + 7) % 7];
}

function calculateIsOpenNow(weeklyHoursValue: unknown): boolean | null {
  const weeklyHours = normalizeWeeklyHours(weeklyHoursValue);

  if (!weeklyHours) {
    return null;
  }

  const { weekday, minutes } = getWinnipegTime();

  const previousWeekday = getPreviousWeekday(weekday);

  const currentDay = parseDayHours(weeklyHours[weekday]);

  const previousDay = parseDayHours(weeklyHours[previousWeekday]);

  for (const interval of currentDay.intervals) {
    const { open, close } = interval;

    if (close > open && minutes >= open && minutes < close) {
      return true;
    }

    // Example: 6:00 p.m. to 2:00 a.m.
    if (close <= open && minutes >= open) {
      return true;
    }
  }

  // Check whether yesterday's hours
  // continue past midnight into today.
  for (const interval of previousDay.intervals) {
    const { open, close } = interval;

    if (close <= open && minutes < close) {
      return true;
    }
  }

  if (currentDay.recognized || previousDay.recognized) {
    return false;
  }

  return null;
}

function getCurrentOpenStatus(place: PlaceRow): {
  label: string;
  tone: Listing["statusTone"];
  details: string;
  isOpenNow: boolean | null;
} {
  if (place.open_status === "temporarily_closed") {
    return {
      label: "TEMPORARILY CLOSED",
      tone: "orange",
      details: "Temporarily closed",
      isOpenNow: false,
    };
  }

  if (place.open_status === "permanently_closed") {
    return {
      label: "CLOSED",
      tone: "orange",
      details: "Permanently closed",
      isOpenNow: false,
    };
  }

  const isOpenNow = calculateIsOpenNow(place.weekly_hours);

  if (isOpenNow === true) {
    return {
      label: "OPEN NOW",
      tone: "green",
      details: "Open now",
      isOpenNow: true,
    };
  }

  if (isOpenNow === false) {
    return {
      label: "CLOSED NOW",
      tone: "orange",
      details: "Closed now",
      isOpenNow: false,
    };
  }

  return {
    label: "HOURS UNKNOWN",
    tone: "amber",
    details: "Hours not confirmed",
    isOpenNow: null,
  };
}

function getLastCheckedLabel(sourceCheckedAt: string | null): string {
  if (!sourceCheckedAt) {
    return "Source check pending";
  }

  const formattedDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: WINNIPEG_TIMEZONE,
    month: "short",
    day: "numeric",
  }).format(new Date(sourceCheckedAt));

  return `Checked ${formattedDate}`;
}

export function convertPlaceToListing(place: PlaceRow): Listing {
  const approvedImageUrl =
    place.image_url && hasPublishablePhotoRights(place.image_rights_notes)
      ? place.image_url
      : null;
  const price = getPriceLabel(place.price_level);

  const currentOpenStatus = getCurrentOpenStatus(place);

  const subtitleParts = [
    place.cuisine_primary ?? place.primary_category,
    price,
  ];

  return {
    id: place.id,
    slug: place.slug,
    type: "restaurant",
    name: place.name,
    category: place.primary_category,

    subtitle: subtitleParts.join(" · "),

    statusLabel: currentOpenStatus.label,

    statusTone: currentOpenStatus.tone,

    timeOrHours: currentOpenStatus.details,

    isOpenNow: currentOpenStatus.isOpenNow,

    price,

    distance: place.neighbourhood ?? "Winnipeg",

    verification: place.verification_status,

    lastChecked: getLastCheckedLabel(place.source_checked_at),

    imageClass: approvedImageUrl ? "image-uploaded" : "image-food",

    imageUrl: approvedImageUrl,

    neighbourhood: place.neighbourhood ?? "Winnipeg",

    description: place.short_description,

    latitude: place.latitude,
    longitude: place.longitude,

    placeType: place.place_type,

    weeklyHours: place.weekly_hours,

    priceLevel: place.price_level,

    searchTerms: [
      place.primary_category,
      place.cuisine_primary ?? "",
      place.place_type,
      place.neighbourhood ?? "",
    ].filter(Boolean),
  };
}

export const placeFields = `
  id,
  slug,
  place_type,
  name,
  short_description,
  primary_category,
  neighbourhood,
  price_level,
  cuisine_primary,
  open_status,
  weekly_hours,
  verification_status,
  warning_message,
  source_checked_at,
  image_url,
  image_rights_notes,
  latitude,
  longitude
  `;

export async function getPublishedPlaceListings(
  limit = 10,
): Promise<Listing[]> {
  const supabase = getPublicSupabaseClient();

  const { data, error } = await supabase
    .from("places")
    .select(placeFields)
    .eq("status", "published")
    .neq("place_type", "event_venue")
    .in("place_type", [
      "restaurant",
      "cafe",
      "bakery_dessert",
      "bar_pub",
      "brewery",
      "food_truck",
      "fast_casual",
      "fine_dining",
      "late_night_food",
      "market",
    ])
    .order("published_at", {
      ascending: false,
    })
    .limit(limit);

  if (error) {
    reportDataAccessError("Unable to load Venture places", error);

    return [];
  }

  return ((data ?? []) as unknown as PlaceRow[]).map(convertPlaceToListing);
}

export async function getPublishedPlaceListingBySlug(
  slug: string,
): Promise<Listing | null> {
  const supabase = getPublicSupabaseClient();

  const { data, error } = await supabase
    .from("places")
    .select(placeFields)
    .eq("slug", slug)
    .eq("status", "published")
    .maybeSingle();

  if (error) {
    reportDataAccessError("Unable to load Venture place", error);

    return null;
  }

  if (!data) {
    return null;
  }

  return convertPlaceToListing(data as unknown as PlaceRow);
}
