# 🛕 Temple Civic Intelligence – Crowd-Mobile-Application

A smart, multilingual temple assistance application designed to help devotees experience safer, smoother, and more convenient darshan at Tirumala Tirupati.

The system combines crowd monitoring, darshan waiting-time estimation, interactive maps, route guidance, entry and exit information, and an AI-powered temple assistant in one user-friendly application.

## 📌 Table of Contents

- [Overview](#-overview)
- [Objectives](#-objectives)
- [Features](#-features)
- [Technology Stack](#-technology-stack)
- [System Architecture](#-system-architecture)
- [Project Structure](#-project-structure)
- [Installation and Setup](#-installation-and-setup)
- [Running the Application](#-running-the-application)
- [Supported Languages](#-supported-languages)
- [Machine Learning](#-machine-learning)
- [Future Enhancements](#-future-enhancements)
- [Disclaimer](#-disclaimer)

## 📖 Overview

Temple Civic Intelligence is a smart temple management and assistance solution focused on improving crowd awareness and helping devotees navigate temple facilities.

During busy periods, devotees may face long waiting times, crowded pathways, difficulty finding entry and exit gates, and limited access to timely information.

This project aims to address these challenges through a mobile-friendly web application that presents important temple information in a simple and accessible format.

## 🎯 Objectives

- Monitor and display crowd information wherever reliable data is available.
- Estimate darshan waiting time using available historical and operational data.
- Help devotees identify temple entry and exit points.
- Display temple locations and crowd information on an interactive map.
- Recommend suitable routes based on available crowd and route information.
- Provide an AI-powered assistant for common temple-related questions.
- Support multiple Indian languages for improved accessibility.
- Present information through a simple, responsive user interface.

## ✨ Features

### 1. 🏠 Smart Home Dashboard
- Welcome screen with essential temple information.
- Crowd monitoring status.
- Quick access to important temple services.
- Mobile-friendly navigation.

### 2. ⏱️ Darshan Waiting-Time Estimation
- Displays waiting-time estimates when supported by available data.
- Uses a machine-learning prediction approach where configured.
- Helps devotees understand the estimated time required for darshan.
- Handles unavailable prediction data with appropriate messages.

### 3. 👥 Crowd Monitoring
- Displays crowd status based on available system data.
- Supports crowd visualization and monitoring functionality.
- Can integrate camera-based crowd counting when the required computer vision components are configured.

### 4. 🗺️ Interactive Temple Map
- Displays relevant temple locations and facilities.
- Helps users understand the locations of entry and exit points.
- Supports map-based crowd visualization where data is available.

### 5. 🚪 Entry and Exit Information
- Helps devotees identify temple entry and exit gates.
- Supports the display of gate availability and crowd status when reliable data is provided.
- Can assist users in finding suitable exits.

### 6. 🧭 Route Guidance
- Helps devotees explore available routes.
- Supports route recommendations based on configured crowd and location data.
- Aims to reduce unnecessary congestion and improve movement.

### 7. 🤖 Ask Tirupati AI
- Provides a conversational interface for temple-related questions.
- Supports typed questions and suggested queries.
- Can support voice input where browser permissions and capabilities allow.
- Uses the configured backend AI service.

### 8. 🌐 Multilingual Interface
The application is designed to support:

- English
- Hindi
- Marathi
- Telugu
- Kannada
- Tamil

Language support depends on the completeness of the translation files and integration of each component.

### 9. 📱 Responsive Design
- Designed for mobile and desktop screens.
- Uses clear navigation, readable text, and accessible controls.
- Aims to make temple information easier to understand for devotees with different levels of digital literacy.

## 🛠️ Technology Stack

| Technology | Purpose |
|---|---|
| React | Frontend user interface |
| Vite | Frontend development server and build tool |
| JavaScript | Application logic |
| CSS | Responsive styling |
| React Router | Page navigation |
| Python | Backend implementation |
| FastAPI | Backend API framework |
| OpenCV | Image and video processing, where configured |
| YOLO | Object detection and crowd analysis, where configured |
| Pandas | Data preparation and processing |
| Scikit-learn | Machine-learning prediction models |
| Joblib | Saving and loading trained models |
| i18next / react-i18next | Multilingual interface |
| Leaflet / OpenStreetMap or configured map provider | Interactive maps |
| Gemini API or configured AI provider | AI chatbot integration |

*The exact technologies available depend on the components and configuration present in your repository.*

## 🏗️ System Architecture

```text
             DEVOTEE / USER
                    |
                    v
          React + Vite Frontend
                    |
        +-----------+-----------+
        |           |           |
        v           v           v
    Crowd Map   Darshan AI   Temple Chatbot
        |           |           |
        +-----------+-----------+
                    |
                    v
              FastAPI Backend
                    |
       +------------+-------------+
       |            |             |
       v            v             v
   Crowd Data   ML Prediction   AI Service
       |            |             |
       +------------+-------------+
                    |
                    v
          Results to Frontend
```

The frontend communicates with the backend through APIs. The backend processes available data and invokes the relevant prediction, crowd-monitoring, or AI services.

## 📁 Project Structure

The following is a representative structure. Your actual repository may contain additional folders and files.

```text
Crowd-Mobile-Application/
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── i18n/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── public/
│   ├── package.json
│   └── vite.config.js
│
├── backend/
│   ├── app/
│   │   └── main.py
│   ├── data/
│   ├── models/
│   └── requirements.txt
│
├── .gitignore
└── README.md
```

## ⚙️ Installation and Setup

### Prerequisites

Install the following software before running the project:

- [Node.js and npm](https://nodejs.org/)
- [Python](https://www.python.org/)
- [Git](https://git-scm.com/)
- A code editor such as Visual Studio Code

### Step 1: Clone the repository

```bash
git clone https://github.com/Anjali0424/Crowd-Intelligence-application.git
cd Crowd-Intelligence-application
```

### Step 2: Set up the frontend

Open a terminal and run:

```bash
cd frontend
npm install
```

Create or configure the frontend environment file if required by your application.

For example, if your frontend uses a configurable API URL:

```env
VITE_API_URL=http://localhost:8000
```

Use the environment variable name expected by your actual code.

### Step 3: Set up the backend

Open a separate terminal:

```bash
cd backend
python -m venv venv
```

Activate the virtual environment.

**Windows PowerShell:**

```powershell
.\venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```bash
pip install -r requirements.txt
```

If your repository uses a different requirements file or backend entry point, follow the existing project configuration.

### Step 4: Configure environment variables

Create a backend `.env` file if required by your application.

Example:

```env
GEMINI_API_KEY=your_api_key_here
```

Replace the example with your actual key if Gemini is the configured provider. Never commit API keys, passwords, or other secrets to GitHub.

### Step 5: Start the backend

From the backend directory, if the FastAPI application is located at `app/main.py`:

```bash
python -m uvicorn app.main:app --reload --port 8000
```

The backend will normally be available at:

- API: `http://localhost:8000`
- Interactive API documentation: `http://localhost:8000/docs`

### Step 6: Start the frontend

Open another terminal:

```bash
cd frontend
npm run dev
```

Open the local URL printed by Vite, commonly:

`http://localhost:5173`

Keep both the frontend and backend running while testing features that require API communication.

## 🧪 Testing

Before using or demonstrating the application, verify:

- The frontend starts without errors.
- The backend starts and exposes the configured API endpoints.
- Frontend API requests reach the backend.
- The map loads correctly.
- Crowd information displays the correct status for the available data.
- Darshan predictions work when a trained model and valid inputs are available.
- The chatbot responds through the configured AI service.
- Language switching updates the supported interface elements.
- Navigation and responsive layouts work on mobile and desktop screens.

For the frontend production build, run:

```bash
cd frontend
npm run build
```

Use the project's configured backend test command if automated tests are available.

## 🤖 Machine Learning

The project can use machine-learning models to estimate darshan waiting times based on historical and operational data.

A typical workflow includes:

1. Collect and prepare relevant data.
2. Clean the dataset and handle missing values.
3. Select suitable input features.
4. Train a regression model.
5. Evaluate predictions against unseen data.
6. Save the trained model.
7. Load the model in the backend and provide predictions through an API.

Possible inputs include arrival time, darshan type, historical waiting times, and crowd indicators, depending on the available dataset.

**Important:** Prediction quality depends on the quality and representativeness of the data. Synthetic demonstration data must not be treated as actual Tirumala crowd or waiting-time records.

## 🔮 Future Enhancements

- Integration with verified live crowd data.
- Improved camera-based crowd counting.
- More accurate waiting-time estimation using real historical data.
- Dynamic route recommendations based on current conditions.
- Voice-based assistance in supported Indian languages.
- Additional accessibility features for elderly devotees and users with limited digital literacy.
- Integration with verified temple facility and emergency-service information.
- Notifications for important crowd and gate-status updates.

## 🔐 Privacy and Security

- Store API keys in environment variables.
- Never upload `.env` files or credentials to GitHub.
- Validate user inputs on the backend.
- Protect APIs that require authentication.
- Avoid collecting unnecessary personal information.
- Follow applicable privacy and security requirements.

## ⚠️ Disclaimer

This project is intended to assist devotees by providing temple-related information and navigation support.

Waiting times, crowd levels, gate availability, and route recommendations are only as reliable as the data sources connected to the application. When verified information is unavailable, the application should clearly indicate that limitation rather than display fabricated live information.

This project does not represent an official Tirumala Tirupati Devasthanams (TTD) application unless officially authorized.

## 👩‍💻 Author

**Anjali Durgam**

GitHub: [Anjali0424](https://github.com/Anjali0424)

Repository: [Crowd-Intelligence-application](https://github.com/Anjali0424/Crowd-Intelligence-application)

---

**Temple Civic Intelligence — Making temple visits simpler, safer, and more accessible for every devotee.**
