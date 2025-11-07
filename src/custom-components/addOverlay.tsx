import * as BUI from '@thatopen/ui'

/**
 * Add a div container on top of the page to show a message.
 *
 * @param sentence - The message to show written in BUI.html`` format
 * @param urgency - If it is a normale or warning message, default='normal', options:'normal','warning'
 * @param time - Time (in milliseconds) that overlay is shown up
 * @returns The message print on top of the page
 */
export const addOverlay = (sentence:BUI.TemplateResult=BUI.html`Overlay <b>example</b>`,urgency:string='normal', time:number=5000) => {
    const overlay = document.getElementById("overlay");
    const color = urgency=='warning' ? 'rgba(255, 0, 0, 0.3)' : 'rgba(0,0,0,0.2)'
    if (overlay) {
        const label = BUI.Component.create<HTMLDivElement>(() => {
            return BUI.html`
            <div style="text-align:center; padding:10px; background:${color}; border-radius: 10px; margin: 5px">
                ${sentence}
            </div>`
        })
        overlay.appendChild(label)
        setTimeout(() => {
            label.style.display = "none";
        }, time); // Nasconde dopo x millisecondi
    }
}