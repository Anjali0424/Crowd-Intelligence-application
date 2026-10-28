import math
import os
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

SYSTEM_PROMPT = """You are Tirupati Temple AI, a helpful multilingual assistant for devotees visiting Tirumala and the Sri Venkateswara Temple.

WHAT YOU HELP WITH:
- Temple history, traditions, and religious significance
- Darshan types, procedures, and waiting-time considerations
- Laddu and prasadam counters
- Temple opening hours and official announcements
- Accommodation and dining facilities
- Washrooms, drinking water, medical centres, and help desks
- Temple entry gates, exits, walking routes, and visitor facilities
- Crowd conditions and safe visitor guidance
- General travel and preparation information related to Tirumala

STYLE (very important):
- Use simple, everyday words.
- Answer in 1-3 short sentences for normal questions.
- You may use a short bullet list (2-4 items) only when really helpful.
- Do not repeat the user's question. Do not add long introductions or summaries.
- Give step-by-step instructions only when the user asks how to do something.
- Keep place names, route names, and directions clear.
- If you do not know, say so briefly and honestly.

LANGUAGE:
- Support English, Hindi, Marathi, and Telugu.
- Reply in the language the user selected. If no language is selected, detect it from the message and reply in that same language.
- Support follow-up questions naturally (use the earlier conversation).
- Keep temple names and important terms accurate.

LIVE DATA:
- You may receive a LIVE DATA block with current crowd readings from temple cameras, and sometimes a nearby facility and route guidance.
- Use LIVE DATA only when it is given. Treat it as a current reading, and say "currently" or "right now" when you use it.
- Never invent crowd counts, waiting times, distances, ticket/laddu availability, facilities, or route recommendations.
- If LIVE DATA is missing or marked unavailable, say briefly that the current value cannot be confirmed, and suggest temple staff or official TTD sources.
- Do not claim you checked live data unless it was actually provided.
- Predictions (if any) are estimates for the future, not current readings; say so clearly.
- You may receive a Darshan waiting-time ESTIMATE block with queue wait, darshan stage time and a total. Present these as estimates ("estimated"/"about"), mention the confidence and method briefly, and never present them as exact measured values. If the estimate is marked UNAVAILABLE, say it cannot be confirmed yet.

ACCURACY AND SAFETY:
- For official rules or announcements you are unsure about, ask the user to check official TTD sources.
- Be respectful of religious beliefs and inclusive toward all visitors.
- If a question is unrelated to the temple, answer briefly and redirect to temple help.
- Keep answers practical and mobile-friendly.
"""

SUPPORTED_LANGS = {"en", "hi", "mr", "te"}

# Coordinates mirror the project's own frontend data (mockTempleMapData.js).
FACILITIES: List[Dict[str, Any]] = [
    {"name": "Medical Help Desk", "type": "Medical", "lat": 13.6832, "lng": 79.3474},
    {"name": "Washroom", "type": "Washroom", "lat": 13.6836, "lng": 79.3470},
    {"name": "Drinking Water", "type": "Drinking Water", "lat": 13.6834, "lng": 79.3469},
    {"name": "Help Desk", "type": "Help Desk", "lat": 13.6837, "lng": 79.3472},
]

# Route -> crowd zones it passes through (from the project's route definitions).
ROUTES: List[Dict[str, Any]] = [
    {"id": "direct", "title": "Direct approach", "zones": ["main-gate", "darshan-area"]},
    {"id": "via-queue", "title": "Via Queue Complex", "zones": ["queue-area", "darshan-area"]},
    {"id": "via-west-mada", "title": "Via West Mada Street", "zones": []},
    {"id": "via-east-mada", "title": "Via East Mada Street", "zones": []},
]

CROWD_KEYWORDS = {
    "crowd", "crowds", "busy", "rush", "queue",
    "भीड़", "भीड", "गर्दी", "రద్దీ", "रश",
    "route", "path", "way", "less crowd", "less-crowd",
    "मार्ग", "रास्ता", "मार्ग", "దారి", "మార్గం",
    "exit", "निकास", "निर्गम", "నిష్కర్మణ",
}

DARSHAN_KEYWORDS = {
    "darshan", "waiting time", "wait time", "how long", "how many hours",
    "hours", "duration", "queue time", "line",
    "दर्शन", "प्रतीक्षा", "इंतज़ार", "कितना समय", "कितने घंटे",
    "दर्शनाची", "किती वेळ", "ప్రతీక్ష", "దర్శనం", "ఎంత సమయం", "క్యూ",
}
MEDICAL_KEYWORDS = {
    "medical", "hospital", "doctor", "clinic", "health", "aid", "ambulance",
    "मेडिकल", "अस्पताल", "डॉक्टर", "चिकित्स", "वैद्यकीय",
    "వైద్య", "ఆసుపత్రి", "డాక్టర్",
}

router = APIRouter(prefix="/api", tags=["chat"])


class ChatMessage(BaseModel):
    role: str = Field(..., pattern="^(user|model|assistant)$")
    content: str


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=4000)
    language: Optional[str] = Field(default="en")
    conversation_id: Optional[str] = None
    history: Optional[List[ChatMessage]] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class ChatResponse(BaseModel):
    reply: str
    language: str
    conversation_id: str


def _get_client():
    try:
        from google import genai
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Google Gen AI SDK is not installed.",
        ) from e

    api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Chatbot not configured. Missing GEMINI_API_KEY.",
        )

    try:
        return genai.Client(api_key=api_key)
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid Gemini API credentials.",
        ) from e


def _get_model() -> str:
    return os.getenv("GEMINI_MODEL", "gemini-2.5-flash")


def _normalize_lang(lang: Optional[str]) -> str:
    if not lang:
        return "en"
    low = lang.lower().strip()
    return low if low in SUPPORTED_LANGS else "en"


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlmb = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlmb / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _live_crowd() -> Dict[str, Dict[str, Any]]:
    """Read the latest YOLO counts per zone (same source as /api/cameras/counts).

    Returns {} when counting has not produced any reading yet.
    """
    try:
        from app.api.cameras import ORDER, _get_session
    except Exception:
        return {}

    zones: Dict[str, Dict[str, Any]] = {}
    for cid in ORDER:
        try:
            data = _get_session(cid).latest()
        except Exception:
            continue
        if not data.get("available") or not data.get("has_count"):
            continue
        zone_id = data.get("zone_id")
        capacity = data.get("capacity")
        if not zone_id or not capacity:
            continue
        people = data.get("people_count") or 0
        density = round((people / capacity) * 100)
        current = zones.get(zone_id)
        if current is None or density > current["density"]:
            zones[zone_id] = {
                "zone_name": data.get("zone_name") or zone_id,
                "people": people,
                "capacity": capacity,
                "density": density,
            }
    return zones


def _nearest_medical(lat: float, lng: float) -> Optional[Dict[str, Any]]:
    best = None
    for facility in FACILITIES:
        if facility["type"] != "Medical":
            continue
        distance = _haversine_m(lat, lng, facility["lat"], facility["lng"])
        if best is None or distance < best["distance_m"]:
            best = {
                "name": facility["name"],
                "lat": facility["lat"],
                "lng": facility["lng"],
                "distance_m": round(distance),
            }
    return best


def _detect_intent(message: str) -> Dict[str, bool]:
    low = message.lower()
    has = lambda words: any(w in low for w in words)  # noqa: E731
    return {
        "crowd": has(CROWD_KEYWORDS),
        "medical": has(MEDICAL_KEYWORDS),
        "darshan": has(DARSHAN_KEYWORDS),
    }


def _darshan_estimate() -> Optional[Dict[str, Any]]:
    """Run the Darshan prediction engine on the current live inputs."""
    try:
        from app.database.database import SessionLocal
        from app.services import darshan_service as svc
    except Exception:
        return None

    db = SessionLocal()
    try:
        status = svc.get_current_status(db)
        prediction = svc.predict(
            db,
            queue=status.get("queue_population"),
            people_inside=status.get("people_inside"),
            processing_rate=status.get("processing_rate_per_hour"),
            camera_count=status.get("camera_count"),
            input_source=status.get("source")
            if status.get("source") in {"camera", "staff", "hybrid"}
            else None,
            persist=False,
        )
        return {"status": status, "prediction": prediction}
    except Exception:
        return None
    finally:
        db.close()


def _build_live_block(req: ChatRequest) -> str:
    intent = _detect_intent(req.message)
    lines: List[str] = []

    wants_crowd = intent["crowd"]
    wants_medical = intent["medical"]
    wants_darshan = intent.get("darshan", False)

    zones = _live_crowd() if (wants_crowd or wants_medical) else {}

    if wants_crowd:
        if zones:
            lines.append("Current crowd readings (LIVE, from temple cameras):")
            for zone_id, z in zones.items():
                lines.append(
                    f"- {z['zone_name']}: {z['people']}/{z['capacity']} people "
                    f"({z['density']}% full)"
                )
            # Recommend the least-crowded route only when zone data exists.
            scored = []
            for route in ROUTES:
                if not route["zones"]:
                    continue
                densities = [zones[z]["density"] for z in route["zones"] if z in zones]
                if len(densities) == len(route["zones"]):
                    scored.append((sum(densities) / len(densities), route["title"]))
            if scored:
                scored.sort()
                lines.append(
                    f"Least-crowded route right now (based on the above): {scored[0][1]}."
                )
            else:
                lines.append("No route has complete live crowd data right now.")
        else:
            lines.append(
                "Current crowd readings: UNAVAILABLE (counting is not active or has no reading yet)."
            )

    if wants_medical:
        med = None
        if req.latitude is not None and req.longitude is not None:
            med = _nearest_medical(req.latitude, req.longitude)
        if med:
            lines.append(
                f"Nearest medical facility to the user: {med['name']} "
                f"(about {med['distance_m']} m away)."
            )
        else:
            lines.append(
                "Medical facilities (known locations): "
                + "; ".join(
                    f"{f['name']}" for f in FACILITIES if f["type"] == "Medical"
                )
                + ". User location not provided, so distance cannot be given."
            )

    if wants_darshan:
        estimate = _darshan_estimate()
        p = (estimate or {}).get("prediction") or {}
        if p.get("available"):
            lines.append(
                "Darshan waiting-time ESTIMATE from the prediction engine "
                "(a future estimate, not a measured reading):"
            )
            lines.append(
                f"- Estimated queue wait: {p.get('wait_minutes')} minutes; "
                f"darshan stage about {p.get('darshan_minutes')} minutes; "
                f"total about {p.get('total_minutes')} minutes "
                f"(range {p.get('range', {}).get('low_minutes')}-"
                f"{p.get('range', {}).get('high_minutes')} minutes)."
            )
            lines.append(
                f"- Method: {p.get('method')}; confidence: {p.get('confidence')}; "
                f"based on {p.get('historical_records')} stored records."
            )
            if p.get("crowd_level"):
                lines.append(f"- Current queue level: {p.get('crowd_level')}.")
        else:
            lines.append(
                "Darshan waiting-time ESTIMATE: UNAVAILABLE (no live queue count "
                "or processing rate is available yet)."
            )

    if not lines:
        return ""
    return "\n\nLIVE DATA (use only if relevant; do not invent beyond this):\n" + "\n".join(lines)


@router.post("/chat", response_model=ChatResponse)
def chat(req: ChatRequest):
    if not req.message or not req.message.strip():
        raise HTTPException(status_code=422, detail="Message cannot be empty")

    lang = _normalize_lang(req.language)
    convo_id = req.conversation_id or str(uuid.uuid4())

    client = _get_client()

    contents: List[Dict[str, Any]] = []
    for turn in (req.history or [])[-8:]:
        role = "model" if turn.role in ("model", "assistant") else "user"
        if not turn.content or not turn.content.strip():
            continue
        contents.append({"role": role, "parts": [{"text": turn.content.strip()}]})

    live_block = _build_live_block(req)
    user_text = f"User language preference: {lang}\n\n{req.message.strip()}{live_block}"
    contents.append({"role": "user", "parts": [{"text": user_text}]})

    try:
        response = client.models.generate_content(
            model=_get_model(),
            contents=contents,
            config={
                "system_instruction": SYSTEM_PROMPT,
                "temperature": 0.3,
                "top_p": 0.9,
                "max_output_tokens": 320,
            },
        )
    except Exception as e:  # noqa: BLE001 - normalized below
        msg = str(e).lower()
        if "timeout" in msg or "deadline" in msg:
            raise HTTPException(status_code=504, detail="AI request timed out")
        if "rate" in msg or "quota" in msg or "429" in msg or "resource_exhausted" in msg:
            raise HTTPException(status_code=429, detail="Rate limit reached")
        if "401" in msg or "403" in msg or "unauth" in msg or "api key" in msg or "credential" in msg:
            raise HTTPException(status_code=401, detail="Invalid AI credentials")
        if "503" in msg or "unavailable" in msg or "overloaded" in msg:
            raise HTTPException(status_code=503, detail="AI service unavailable")
        raise HTTPException(status_code=500, detail="AI request failed")

    reply = getattr(response, "text", None)
    if not reply:
        try:
            candidates = getattr(response, "candidates", []) or []
            if candidates:
                parts = getattr(getattr(candidates[0], "content", {}), "parts", []) or []
                reply = " ".join(p.text for p in parts if getattr(p, "text", None)) or ""
        except Exception:
            reply = ""

    if not reply or not reply.strip():
        raise HTTPException(status_code=503, detail="AI returned empty response")

    return ChatResponse(reply=reply.strip(), language=lang, conversation_id=convo_id)
