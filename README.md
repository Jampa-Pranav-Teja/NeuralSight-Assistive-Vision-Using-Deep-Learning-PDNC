# NeuralSight - Assistive Vision Assistant

NeuralSight is a real-time assistive vision application designed to help visually impaired individuals navigate their environment with greater independence. By leveraging advanced deep learning models, the application analyzes camera input to provide audio descriptions of the user's surroundings, detect hazards, and read text.

## 🌟 Features

- **Real-time Environment Analysis**: Instantly processes camera feed to describe the scene.
- **Hazard Detection**: Identifies obstacles like stairs, curbs, and other immediate dangers.
- **Spatial Awareness**: Uses "clock-face" notation (e.g., "Chair at your 2 o'clock") for precise directional guidance.
- **OCR (Optical Character Recognition)**: Reads signs, labels, and currency.
- **Text-to-Speech**: Converts visual descriptions into clear, natural-sounding audio feedback.

## 🛠️ Technology Stack

- **Frontend**: React, Vite, Tailwind CSS
- **Animations**: Motion (Framer Motion)
- **AI Integration**: Gemini API (Multimodal analysis & Text-to-Speech)
- **Icons**: Lucide React

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- npm or yarn
- A valid Gemini API Key

### Installation

1.  **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/neuralsight.git
    cd neuralsight
    ```

2.  **Install dependencies**

    ```bash
    npm install
    ```

3.  **Configure Environment Variables**

    Create a `.env` file in the root directory and add your API key:

    ```env
    GEMINI_API_KEY=your_api_key_here
    ```

4.  **Run the application**

    ```bash
    npm run dev
    ```

    Open your browser and navigate to `http://localhost:3000` (or the port shown in your terminal).

## 📱 Usage

1.  Grant camera permissions when prompted.
2.  Point your camera at the environment or object you want to analyze.
3.  The application will automatically capture images, analyze them, and read out the description.
4.  Listen for audio cues regarding hazards and spatial details.

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.
