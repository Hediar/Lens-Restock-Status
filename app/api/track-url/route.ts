import { NextRequest, NextResponse } from "next/server";
import { parseGenericProduct } from "@/scripts/parsers/generic.mjs";

export const runtime = "nodejs";
export const maxDuration = 30;

const KNOWN_HOSTS: Record<string, string> = {
  "lenbling.com": "렌블링 (이미 자동 추적 중인 사이트예요)",
  "lenssis-online.com": "렌시스 (이미 자동 추적 중인 사이트예요)",
  "xn--sm2bu7q1e.com": "렌시스 (이미 자동 추적 중인 사이트예요)",
};

export async function POST(req: NextRequest) {
  const { url } = await req.json();
  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch {
    return NextResponse.json({ error: "올바른 URL이 아니에요." }, { status: 400 });
  }
  if (!/^https?:$/.test(parsed.protocol)) {
    return NextResponse.json({ error: "http/https 주소만 등록할 수 있어요." }, { status: 400 });
  }

  const host = parsed.hostname.replace(/^www\./, "");
  const knownNote = KNOWN_HOSTS[host] ?? null;

  try {
    const res = await fetch(parsed.toString(), {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
        "Accept-Language": "ko-KR,ko;q=0.9",
      },
      signal: AbortSignal.timeout(20000),
      redirect: "follow",
    });
    if (!res.ok) {
      const blocked = res.status === 403 || res.status === 429;
      return NextResponse.json(
        {
          error: blocked
            ? "이 사이트는 자동 접근(크롤링)을 차단하고 있어서 추적할 수 없어요. 대형 브랜드 공식몰은 대부분 차단합니다."
            : `페이지를 열 수 없어요 (HTTP ${res.status}).`,
        },
        { status: 502 }
      );
    }
    const html = await res.text();
    const info = parseGenericProduct(html) as {
      name: string | null;
      image: string | null;
      inStock: boolean | null;
      judgedBy: string | null;
    } | null;
    if (!info || (!info.name && info.inStock === null)) {
      return NextResponse.json(
        { error: "상품 정보를 읽지 못했어요. 이 사이트는 추적이 어려울 수 있어요." },
        { status: 422 }
      );
    }
    return NextResponse.json({
      url: parsed.toString(),
      name: info.name ?? parsed.hostname,
      image: info.image,
      inStock: info.inStock,
      judgedBy: info.judgedBy,
      knownNote,
    });
  } catch (e) {
    return NextResponse.json(
      { error: `페이지 확인 실패: ${(e as Error).message}` },
      { status: 502 }
    );
  }
}
