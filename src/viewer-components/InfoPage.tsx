import * as BUI from '@thatopen/ui';
import React from 'react';
import { DisplayP3ColorSpace } from 'three/examples/jsm/math/ColorSpaces.js';

export function InfoPage() {

    const setInfoPage = () => {
        const mailButton = BUI.Component.create<BUI.Button>(() => {
            return BUI.html`
                <bim-button 
                    icon='logos:google-gmail' 
                    style='display:flex; flex-direction:row; font-family:"Nunito"; letter-spacing:0.05rem; max-width:fit-content; background-color:transparent !important; padding:0.5rem; align-items:center'
                    tooltip-title='ygor.fasanella@phd.unipd.it'
                    @click=${() => {window.open('mailto:ygor.fasanella@phd.unipd.it', '_blank')}}
                ><b style='font-size: 1.15rem; color:rgb(239, 239, 239); font-family:"Nunito"; z-index:10; letter-spacing:0.05rem; margin-left:0.2rem'>Mail</b></bim-button>
            `
        })
        const LinkedinButton = BUI.Component.create<BUI.Button>(() => {
            return BUI.html`
                <bim-button 
                    icon='devicon:linkedin'
                    style='display:flex; flex-direction:row; font-family:"Nunito"; letter-spacing:0.05rem; max-width:fit-content; background-color:transparent !important; padding:0.5rem; align-items:center'
                    tooltip-title='https://www.linkedin.com/in/ygor-fasanella'
                    @click=${() => {window.open('https://www.linkedin.com/in/ygor-fasanella', '_blank')}}
                ><b style='font-size: 1.15rem; color:rgb(239, 239, 239); font-family:"Nunito"; z-index:10; letter-spacing:0.05rem; margin-left:0.2rem'>LinkedIn</b></bim-button>
            `
        })
        const contactsSection = document.getElementById('contacts')
        contactsSection?.appendChild(mailButton)
        contactsSection?.appendChild(LinkedinButton)
    }

    React.useEffect(() => {
        setInfoPage();
    }, [setInfoPage]);

    return (
        <div
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
            <h1 className="pages-header">INFO</h1>
        </header>

        <div style={{display:'flex', flexDirection:'row', gap:'2rem'}}>
            <section className="info-card">
                <h2 className="info-card-title">The project</h2>
                <p className="info-card-description">
                    The project focuses on the development of an interactive system for <b>advanced data visualization</b> in an <b>openBIM</b> (Building Information Modeling) environment.
                    Based on the open <b>IFC</b> (Industry Foundation Classes) standard and the libraries provided by <b>That Open Company</b>, the system enables the exploration and 
                    analysis of three-dimensional information models directly in the browser.
                </p>
                <p className="info-card-description">
                    <b>Visualization</b> represents the core of the project: it is not merely a tool for geometric representation, but a means to <b>interpret</b>, <b>understand</b>, 
                    and <b>communicate</b> the technical and semantic information embedded in the IFC model. The interface is designed to make complex data easily readable, 
                    allowing smooth navigation and direct interaction with the model’s elements.
                </p>
                <p className="info-card-description">
                    The main goal is to demonstrate how <b>visual representation</b> can become a channel for <b>knowledge</b> and <b>collaboration</b>, supporting more informed decision-making 
                    processes and ensuring greater transparency in the management of information throughout the lifecycle of a built asset.
                </p>
            </section>

            <div style={{display:'flex', flexDirection:'column', gap:'2rem'}}>
                <section className="info-card">
                    <h2 className="info-card-title">About me</h2>
                    <p className="info-card-description">
                        <b>Ygor Fasanella</b> is a 26 years old Building Engineer and a PhD candidate at the University of Padua, Department of Civil, Environmental and Architectural Engineering (ICEA).  
                        His research focuses on <b>data visualizatio</b>n in the <b>Architecture, Engineering and Construction (AEC)</b> sector, with particular attention 
                        to <b>BIM-based methodologies</b>, <b>interoperability</b>, and <b>open standards</b>.
                    </p>
                    <p className="info-card-description">
                        He is particularly interested in <b>BIM</b>, <b>openBIM</b>, <b>IFC standards</b>, and <b>digital technologies for the built environment</b>.
                        His work also involves <b>Virtual Reality</b> and <b>Common Data Environments (CDE)</b>, focusing on making complex information more 
                        <b>accessible</b>, <b>interactive</b>, and <b>collaborative</b>.
                    </p>
                </section>
                <section className="info-card">
                    <h2 className="info-card-title">Contacts</h2>
                    <div id='contacts' style={{display:'flex', flexDirection:'row'}}></div>
                </section>
            </div>
        </div>


        </div>
    );
}
