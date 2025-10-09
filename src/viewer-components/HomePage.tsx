export function HomePage() {
    return (
        <div 
            style={{
                height: '100vh',
                padding: "2rem",
                boxSizing: 'border-box',
                fontFamily: "Arial, sans-serif",
                color: "#fff",
                display: 'flex',
                flexDirection: 'column',
                overflow: 'hidden',
                
                backgroundImage: "linear-gradient(rgba(15, 15, 15, 0.4), rgba(15, 15, 15, 0.4)), url('/PNG/home-image-L.png')",
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                backgroundRepeat: 'no-repeat',
            }}>

            <header style={{ display:'flex', flexDirection:'column', textAlign:"left", flex: 1, marginBottom:"2rem", marginLeft:"2rem"}}>
                <h1 className="pages-header home-title" style={{ fontWeight: "bold", margin: 0 }}>VISUALIZE</h1>
                <h1 className="pages-header home-title" style={{ margin: 0 }}>YOUR</h1>
                <h1 className="pages-header home-title" style={{ margin: 0 }}>AEC</h1>
                <h1 className="pages-header home-title" style={{ margin: 0 }}>DATA</h1>

                <div style={{ display:'flex', flex:1, alignItems:'center', justifyContent:'left', textAlign:'left', marginTop:'32px'}}>
                    <div style={{ fontSize: "clamp(1.5rem, 2.5vw, 2.5rem)", color: "rgba(224, 224, 224, 0.75)", margin: 0, maxWidth:"100%"}}>
                        <p className="home-description">Explore <strong className="home-description">OpenBIM</strong> standards and web technologies</p>
                        <p className="home-description">transforming interconnected AEC <strong className="home-description">data</strong> into</p>
                        <p className="home-description">interactive and meaningful 3D <strong className="home-description">visualizations</strong></p>
                    </div>
                </div>
            </header>
        </div>
    );
}
