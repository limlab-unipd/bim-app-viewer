export function SurveyPage() {

    const loadSurvey = (language:string='ITA') => {
        const container = document.getElementById('survey-page')
        if (!container) return
        container.innerHTML = ''
        if (language == 'ENG'){
            container.innerHTML = `
                <header style="text-align:center; margin-bottom:2rem">
                    <h1 class="pages-header">Survey</h1>
                </header>
                <iframe
                    src="https://docs.google.com/forms/d/e/1FAIpQLSfoUvaS4cCfrJ2R7NVGwAZKHD3nBTp9p6uN6ijJUo1HzCRYIA/viewform?embedded=true"
                    style="width:100%; min-height:90vh; border:none; background-color:transparent;">
                    Loading ENG survey ...
                </iframe>
            `
        } else if (language == 'ITA'){
            container.innerHTML = `
                <header style="text-align:center; margin-bottom:2rem">
                    <h1 class="pages-header">Survey</h1>
                </header>
                <iframe
                    src="https://docs.google.com/forms/d/e/1FAIpQLSdZfrK0O9zmeo4iJHlFNG4fNv9-aR_BtMC1uRmZbCprnTPj0Q/viewform?embedded=true"
                    style="width:100%; min-height:90vh; border:none; background-color:transparent;">
                    Loading ITA survey ...
                </iframe>
            `
        }
    }

    return (
        <div
            id = 'survey-page'
            style={{
                flex: 1,
                padding: "2rem",
                overflowY: "auto",
                fontFamily: "Arial, sans-serif",
                backgroundColor: 'var(--background)',
                color: "#333",
            }}
            >
            <header style={{ textAlign: "center", marginBottom: "2rem" }}>
                <h1 className="pages-header">Survey</h1>
                <p className="pages-subheader">Choose your language:</p>
            </header>

            <div style={{ display:'flex', flexDirection:'row' }}>
                <section
                    className="survey-card"
                    onClick={() => {loadSurvey('ITA')}}
                >
                    <h2 className="info-card-title"  style={{ margin:"0"}}>ITA</h2>
                </section>
                <section
                    className="survey-card"
                    onClick={() => {loadSurvey('ENG')}}
                >
                    <h2 className="info-card-title" style={{ margin:"0"}}>ENG</h2>
                </section>
            </div>
        </div>
    );
}