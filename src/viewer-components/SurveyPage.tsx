import React from "react";

export function SurveyPage() {
    // 1. Carica survey in pagina
    const loadSurvey = (surveyId: string) => {
        const container = document.getElementById("survey-page");
        if (!container) return;
        container.innerHTML = "";
        const surveyMap: Record<string, string> = {
            "survey-cost-ita":
                "https://docs.google.com/forms/d/e/1FAIpQLSdZfrK0O9zmeo4iJHlFNG4fNv9-aR_BtMC1uRmZbCprnTPj0Q/viewform?embedded=true",
            "survey-cost-eng":
                "https://docs.google.com/forms/d/e/1FAIpQLSfoUvaS4cCfrJ2R7NVGwAZKHD3nBTp9p6uN6ijJUo1HzCRYIA/viewform?embedded=true",
            // placeholder per urban survey (future)
            "survey-urban-ita": "",
            "survey-urban-eng": "",
        };
        const surveyTitleMap: Record<string, string> = {
            "survey-cost-ita": 'Cost survey - ITA',
            "survey-cost-eng": 'Cost survey - ENG',
            "survey-urban-ita": "Urban survey - ITA",
            "survey-urban-eng": "Urban survey - ENG",
        };
        const url = surveyMap[surveyId];
        if (!url) {
            container.innerHTML = `<p style="text-align:center;margin-top:2rem">Survey not available yet.</p>`;
            return;
        }
        container.innerHTML = `
            <header style="text-align:center; margin-bottom:2rem">
                <h1 class="pages-header">${surveyTitleMap[surveyId]}</h1>
            </header>
            <iframe
                src="${url}"
                style="width:100%; flex:1; overflow:auto; border:none; background-color:transparent;">
                Loading survey...
            </iframe>
        `;
    };

    // 2. Apertura nuova tab del sito con parametro "?survey="
    const openSurveyInNewTab = (surveyId: string) => {
        const baseUrl = window.location.origin + window.location.pathname;
        window.open(`${baseUrl}?survey=${surveyId}`, "_blank");
    };

    // 3. Controllo all'avvio: se c’è un parametro survey, carica
    React.useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const surveyId = params.get("survey");
        if (surveyId) {
            loadSurvey(surveyId);
        }
    }, []);

    // 4. Pagina principale (senza survey caricato)
    return (
        <div
            id="survey-page"
            style={{
                display: "flex",
                flexDirection: "column",
                flex: 1,
                padding: "2rem",
                overflowY: "auto",
                fontFamily: "Arial, sans-serif",
                backgroundColor: "var(--background)",
                color: "#333",
            }}
        >
            {/* COST VIEWER */}
            <header style={{ textAlign: "center", marginBottom: "1rem" }}>
                <h1 className="pages-header">Survey</h1>
                <p className="pages-subheader">COST VIEWER</p>
                <p className="pages-subsubheader">Choose your language:</p>
            </header>

            <div style={{ display: "flex", flexDirection: "row" }}>
                <section
                    className="survey-card"
                    onClick={() => openSurveyInNewTab("survey-cost-ita")}
                >
                    <h2 className="info-card-title" style={{ margin: "0", justifyContent: "center" }}>
                        ITA
                    </h2>
                </section>

                <section
                    className="survey-card"
                    onClick={() => openSurveyInNewTab("survey-cost-eng")}
                >
                    <h2 className="info-card-title" style={{ margin: "0", justifyContent: "center" }}>
                        ENG
                    </h2>
                </section>
            </div>

            {/* URBAN VIEWER */}
            <header style={{ textAlign: "center", marginBottom: "1rem" }}>
                <p className="pages-subheader">URBAN VIEWER</p>
                <p className="pages-subsubheader">( coming soon ... )</p>
                <p className="pages-subsubheader">Choose your language:</p>
            </header>

            <div style={{ display: "flex", flexDirection: "row" }}>
                <section
                    className="survey-card-coming-soon"
                    onClick={() => {
                        //openSurveyInNewTab("survey-urban-ita")
                    }}
                >
                    <h2 className="info-card-title" style={{ margin: "0", justifyContent: "center" }}>
                        ITA
                    </h2>
                </section>

                <section
                    className="survey-card-coming-soon"
                    onClick={() => {
                        //openSurveyInNewTab("survey-urban-eng")
                    }}
                >
                    <h2 className="info-card-title" style={{ margin: "0", justifyContent: "center" }}>
                        ENG
                    </h2>
                </section>
            </div>
        </div>
    );
}
