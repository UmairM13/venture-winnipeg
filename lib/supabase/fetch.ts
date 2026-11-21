import "server-only";

export const supabaseServerFetch: typeof fetch = (input, init) => {
  const publicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const internalUrl = process.env.SUPABASE_INTERNAL_URL;

  if (!publicUrl || !internalUrl) {
    return fetch(input, init);
  }

  const url = new URL(input instanceof Request ? input.url : input);

  if (url.origin !== new URL(publicUrl).origin) {
    return fetch(input, init);
  }

  const internal = new URL(internalUrl);

  url.protocol = internal.protocol;
  url.host = internal.host;

  const request = input instanceof Request ? new Request(url, input) : url;

  return fetch(request, init);
};
