import fs from "fs";

const packs = {
  en: {
    "map.noLiveData": "No live data",
    "map.trafficTitle": "Crowd on the route",
    "map.trafficUpdating": "Updating",
    "map.trafficUnavailable": "Information is not available right now. Please try again later.",
    "map.peopleSeen": "People",
    "map.space": "Space",
    "map.realSpace": "Camera space",
    "map.howFull": "How full",
    "map.camera": "Camera {{id}}",
    "map.trafficNote": "Counts update every few seconds. They may not match the crowd you see.",
    "map.selectedPlace": "Selected place",
  },
  hi: {
    "map.noLiveData": "अभी की जानकारी नहीं",
    "map.trafficTitle": "रास्ते पर भीड़",
    "map.trafficUpdating": "अपडेट हो रहा है",
    "map.trafficUnavailable": "अभी जानकारी उपलब्ध नहीं है। बाद में फिर कोशिश करें।",
    "map.peopleSeen": "लोग",
    "map.space": "जगह",
    "map.realSpace": "कैमरे की जगह",
    "map.howFull": "कितना भरा है",
    "map.camera": "कैमरा {{id}}",
    "map.trafficNote": "गिनती हर कुछ सेकंड में बदलती है। यह आपके सामने की भीड़ से अलग हो सकती है।",
    "map.selectedPlace": "चुनी हुई जगह",
  },
  te: {
    "map.noLiveData": "ప్రస్తుత సమాచారం లేదు",
    "map.trafficTitle": "దారిలో రద్దీ",
    "map.trafficUpdating": "నవీకరిస్తోంది",
    "map.trafficUnavailable": "ఇప్పుడు సమాచారం లేదు. తర్వాత మళ్లీ ప్రయత్నించండి.",
    "map.peopleSeen": "మంది",
    "map.space": "చోటు",
    "map.realSpace": "కెమెరా చోటు",
    "map.howFull": "ఎంత నిండి ఉంది",
    "map.camera": "కెమెరా {{id}}",
    "map.trafficNote": "లెక్క కొన్ని సెకన్లకు మారుతుంది. మీరు చూసే రద్దీకి భిన్నంగా ఉండవచ్చు.",
    "map.selectedPlace": "ఎంచుకున్న చోటు",
  },
  mr: {
    "map.noLiveData": "आत्ताची माहिती नाही",
    "map.trafficTitle": "रस्त्यावरील गर्दी",
    "map.trafficUpdating": "अद्यतन होत आहे",
    "map.trafficUnavailable": "आत्ता माहिती उपलब्ध नाही. नंतर पुन्हा प्रयत्न करा.",
    "map.peopleSeen": "लोक",
    "map.space": "जागा",
    "map.realSpace": "कॅमेऱ्याची जागा",
    "map.howFull": "किती भरले आहे",
    "map.camera": "कॅमेरा {{id}}",
    "map.trafficNote": "मोजणी काही सेकंदांनी बदलते. तुम्ही पाहत असलेल्या गर्दीपेक्षा वेगळी असू शकते.",
    "map.selectedPlace": "निवडलेली जागा",
  },
  ta: {
    "map.noLiveData": "நேரடி தகவல் இல்லை",
    "map.trafficTitle": "வழியில் கூட்டம்",
    "map.trafficUpdating": "புதுப்பிக்கிறது",
    "map.trafficUnavailable": "இப்போது தகவல் இல்லை. பிறகு மீண்டும் முயற்சிக்கவும்.",
    "map.peopleSeen": "பேர்",
    "map.space": "இடம்",
    "map.realSpace": "கேமரா இடம்",
    "map.howFull": "எவ்வளவு நிறைந்துள்ளது",
    "map.camera": "கேமரா {{id}}",
    "map.trafficNote": "எண்ணிக்கை சில வினாடிகளுக்கு மாறும். நீங்கள் காண்பதைவிட வேறுபடலாம்.",
    "map.selectedPlace": "தேர்ந்தெடுத்த இடம்",
  },
  kn: {
    "map.noLiveData": "ನೇರ ಮಾಹಿತಿ ಇಲ್ಲ",
    "map.trafficTitle": "ದಾರಿಯಲ್ಲಿ ಜನಸಂದಣಿ",
    "map.trafficUpdating": "ನವೀಕರಿಸಲಾಗುತ್ತಿದೆ",
    "map.trafficUnavailable": "ಈಗ ಮಾಹಿತಿ ಇಲ್ಲ. ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.",
    "map.peopleSeen": "ಜನರು",
    "map.space": "ಜಾಗ",
    "map.realSpace": "ಕ್ಯಾಮೆರಾ ಜಾಗ",
    "map.howFull": "ಎಷ್ಟು ತುಂಬಿದೆ",
    "map.camera": "ಕ್ಯಾಮೆರಾ {{id}}",
    "map.trafficNote": "ಎಣಿಕೆ ಕೆಲವು ಸೆಕೆಂಡುಗಳಿಗೊಮ್ಮೆ ಬದಲಾಗುತ್ತದೆ. ನೀವು ನೋಡುವ ಜನಸಂದಣಿಗಿಂತ ಬೇರೆಯಾಗಿರಬಹುದು.",
    "map.selectedPlace": "ಆಯ್ಕೆಮಾಡಿದ ಸ್ಥಳ",
  },
};

function setPath(obj, dotted, value) {
  const parts = dotted.split(".");
  let current = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    current = current[parts[i]];
  }
  current[parts[parts.length - 1]] = value;
}

for (const [lang, map] of Object.entries(packs)) {
  const file = `src/i18n/locales/${lang}.json`;
  const data = JSON.parse(fs.readFileSync(file, "utf8"));
  for (const [key, value] of Object.entries(map)) setPath(data, key, value);
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`);
}
