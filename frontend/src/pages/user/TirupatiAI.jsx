import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";

import { getSpeechLang, sendChat } from "../../services/chatbotService";
import "./TirupatiAI.css";

function TirupatiAI() {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();

  const [question, setQuestion] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [conversationId, setConversationId] = useState(null);
  const [micState, setMicState] = useState("idle");
  const [micError, setMicError] = useState("");

  const recognitionRef = useRef(null);
  const inputRef = useRef(null);
  const chatRef = useRef(null);

  const appLang = (i18n.language || "en").slice(0, 2);
  const languageCode = ["en", "hi", "mr", "te"].includes(appLang)
    ? appLang
    : "en";

  const suggestions = [
    t("home.askQ1"),
    t("home.askQ2"),
    t("home.askQ3"),
    t("home.askQ4"),
  ];

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch (err) {
          /* ignore */
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [messages, loading]);

  async function submitQuestion(text) {
    const value = (text ?? question).trim();
    if (!value || loading) return;

    setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((prev) => [...prev, { role: "user", content: value }]);
    setQuestion("");
    setLoading(true);

    try {
      const res = await sendChat({
        message: value,
        language: languageCode,
        conversationId,
        history,
      });
      if (res?.conversation_id) setConversationId(res.conversation_id);
      setMessages((prev) => [
        ...prev,
        { role: "model", content: res?.reply ?? "" },
      ]);
    } catch (err) {
      const detail =
        err?.response?.data?.detail || err?.message || t("home.chatError");
      setError(typeof detail === "string" ? detail : t("home.chatError"));
      setMessages((prev) => [
        ...prev,
        { role: "model", content: t("home.chatError") },
      ]);
    } finally {
      setLoading(false);
      if (inputRef.current) inputRef.current.focus();
    }
  }

  function handleMicClick() {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;

    if (!SpeechRecognition) {
      setMicState("error");
      setMicError(t("home.voiceUnsupported"));
      return;
    }

    if (micState === "listening" && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        /* ignore */
      }
      setMicState("processing");
      return;
    }

    setMicError("");
    const recognition = new SpeechRecognition();
    recognition.lang = getSpeechLang(languageCode);
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setMicState("listening");
    };

    recognition.onresult = (event) => {
      const transcript = event?.results?.[0]?.[0]?.transcript ?? "";
      if (!transcript.trim()) {
        setMicState("error");
        setMicError(t("home.voiceEmpty"));
      } else {
        setQuestion(transcript.trim());
        submitQuestion(transcript.trim());
      }
    };

    recognition.onerror = (event) => {
      const code = event?.error || "";
      if (code === "not-allowed" || code === "service-not-allowed") {
        setMicError(t("home.voiceDenied"));
      } else if (code === "audio-capture") {
        setMicError(t("home.voiceNoMic"));
      } else if (code === "no-speech") {
        setMicError(t("home.voiceEmpty"));
      } else {
        setMicError(t("home.voiceError"));
      }
      setMicState(code === "aborted" ? "idle" : "error");
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setMicState((prev) => (prev === "error" ? "error" : "idle"));
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setMicState("listening");
    } catch (err) {
      setMicState("error");
      setMicError(t("home.voiceError"));
    }
  }

  return (
    <div className="tai-page">
      <button
        type="button"
        className="tai-back"
        onClick={() => navigate("/user")}
      >
        ← {t("home.backToHome", { defaultValue: "Back" })}
      </button>

      <section className="dh-ai-card" aria-labelledby="tai-title">
        <div className="dh-ai-head">
          <span className="dh-ai-icon" aria-hidden="true">
            🤖
          </span>
          <div>
            <h1 id="tai-title" className="dh-ai-title">
              {t("home.askTitle")}
            </h1>
            <p className="dh-ai-subtitle">{t("home.askSubtitle")}</p>
          </div>
        </div>

        <div className="dh-ai-chips">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="dh-ai-chip"
              onClick={() => submitQuestion(suggestion)}
              disabled={loading}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <div className="dh-ai-chat" aria-live="polite" ref={chatRef}>
          {messages.map((message, idx) => (
            <div
              key={`${message.role}-${idx}`}
              className={
                message.role === "user"
                  ? "dh-ai-bubble dh-ai-user"
                  : "dh-ai-bubble dh-ai-model"
              }
            >
              {message.content}
            </div>
          ))}
          {loading && (
            <div className="dh-ai-bubble dh-ai-model dh-ai-typing">
              {t("home.chatTyping")}
            </div>
          )}
        </div>

        {error && <p className="dh-ai-error">{error}</p>}
        {micState === "error" && micError && (
          <p className="dh-ai-error" role="alert">
            {micError}
          </p>
        )}

        <form
          className="dh-ai-input-row"
          onSubmit={(event) => {
            event.preventDefault();
            submitQuestion();
          }}
        >
          <input
            ref={inputRef}
            type="text"
            className="dh-ai-input"
            placeholder={t("home.askPlaceholder")}
            aria-label={t("home.askPlaceholder")}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button
            type="button"
            className={
              micState === "listening" ? "dh-ai-mic listening" : "dh-ai-mic"
            }
            aria-label={
              micState === "listening" ? t("home.voiceStop") : t("home.voice")
            }
            title={t("home.voice")}
            aria-pressed={micState === "listening"}
            onClick={handleMicClick}
          >
            <span aria-hidden="true">
              {micState === "listening" ? "⏹" : "🎤"}
            </span>
          </button>
          <button
            type="submit"
            className="dh-ai-send"
            aria-label={t("home.send")}
            title={t("home.send")}
            disabled={loading || !question.trim()}
          >
            <span aria-hidden="true">➤</span>
          </button>
        </form>

        <p className="dh-ai-note">{t("home.voiceHint")}</p>
      </section>
    </div>
  );
}

export default TirupatiAI;
