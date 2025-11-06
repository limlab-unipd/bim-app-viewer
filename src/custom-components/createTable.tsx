import * as React from 'react'
import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
import * as FRAGS from '@thatopen/fragments'
import * as BUIC from '@thatopen/ui-obc'
import * as WEBIFC from 'web-ifc'
import * as THREE from "three"
import * as OBCF from '@thatopen/components-front'
import { getIFCClassNamesFromCodes } from '../custom-components/ifc-code-converter'
import { convertCurrency, convertUnits } from '../custom-components/conversion'
import { normalizeAndMapToColor, groupIdsByNormalizedValuePerModel } from '../custom-components/colors'
import Stats, { Panel } from 'stats.js'


const onSearch = (e: Event, table:BUI.Table<any>) => {
    const input = e.target as BUI.TextInput;
    table.queryString = input.value !== "" ? input.value : null
}
const onClearPanel = (panel: BUI.Panel, title:string='Void Panel') => {
    panel.innerHTML = ''
    panel.label = title
}
const onSortTable = (e: Event, table:BUI.Table<any>) => {
    function parseValue(value: string): number | string {
        const numericPart = value.split(' ')[0]
        const parsed = Number(numericPart)
        // Se il valore è numerico e la stringa inizia con quel numero, trattalo come numero
        if (!isNaN(parsed) && value.trim().startsWith(numericPart)) { return parsed }
        // Altrimenti trattalo come stringa (case-insensitive)
        return value.toLowerCase()
    }
    function sortTable(table: BUI.Table<any>,ascending: boolean = true,field: string) {
        const direction = ascending ? 1 : -1
        table.data.sort((a, b) => {
            const valA = a.data[field]
            const valB = b.data[field]
            // Se entrambi sono numeri
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * direction
            }
            // Ordinamento alfabetico
            return valA.toString().localeCompare(valB.toString()) * direction
        })
    }
    if (!e.target) return
    const field = (e.target as any).value[0]
    //const direction = target.split(' ')[1]
    let ascending: boolean = true
    //ascending = (direction == '(highest-up)' || direction == '(A-down)') ? false : true
    sortTable(table,ascending,field)
    table.requestUpdate()
}


export async function createTable (panelDown:BUI.Panel,fragments:OBC.FragmentsManager,components:OBC.Components,paramOne:string='Concret',paramTwo:string='Glass') {

    const highlighter = components.get(OBCF.Highlighter)

    //CREATE THE TABLE
    type tableType = {
        model:string,
        localId:number,
        Suburb: string,
        Param1: number,
        Param2: number,
    }
    const urbanTable = document.createElement("bim-table") as BUI.Table<tableType>
    urbanTable.data = [{
        data: {
            Suburb: '',
            Param1: 1,
            Param2: 1,
        }
    }]
    urbanTable.data = []
    urbanTable.preserveStructureOnFilter = true
    urbanTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
    urbanTable.hiddenColumns = ['model', 'localId']
    for (const [modelName,model] of fragments.list.entries()){
        if (!modelName.includes('-DELTA')) continue
        const items = await model.getItems()
        for (const [id,data] of items.entries()){
            urbanTable.data.push({
                data: {
                    model: modelName,
                    localId: id,
                    Suburb: data.data.Suburb.value,
                    Param1: data.data[paramOne].value,
                    Param2: data.data[paramTwo].value
                }
            })
        }
    }
    urbanTable.dataTransform.Suburb = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
        const { model, localId } = rowData
        return BUI.html`
            <bim-label @click=${() => {highlighter.highlightByID("select", {[model as string]: new Set<number>([localId as number])}, false, true)}}>
                ${value}
            </bim-label>
        `
    }

    const sortbyResourcesDropdown = BUI.Component.create<BUI.Dropdown>(
        () => BUI.html`
            <bim-dropdown name="sortTable" style="max-width:fit-content"
                @change="${(e:Event) => {
                    if (!e.target) return
                    onSortTable(e, urbanTable)}}">
                <bim-option style="padding:0 0.5rem 0 0.5rem" label="Suburb" value="Suburb"></bim-option>
                <bim-option style="padding:0 0.5rem 0 0.5rem" label=${paramOne} value='Param1'></bim-option>
                <bim-option style="padding:0 0.5rem 0 0.5rem" label=${paramTwo} value='Param2'></bim-option>
            </bim-dropdown>`,
    )

    //CREATE THE PANEL
    const urbanDownPanel = BUI.Component.create<BUI.Panel>(() => {
        return BUI.html`
        <bim-panel style="display:flex; flex-direction:column; gap:10px; margin:10px; background-color:transparent; flex:1;">
            <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px'})}>
                <bim-label>Param1 (bar height): ${paramOne}</bim-label>
                <bim-label>Param2 (bar color): ${paramTwo}</bim-label>
                <div style="display: flex; gap: 0.5rem;">
                    <bim-label>Sort by:</bim-label>
                    ${sortbyResourcesDropdown}
                    <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,urbanTable)}}></bim-text-input>
                    <bim-button @click=${() => {onClearPanel(panelDown)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                    <bim-button tooltip-text="Click on item's name to add it to the selection" icon='majesticons:lightbulb-shine' style="max-width:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                </div>
                ${urbanTable}
            </div>
        </bim-panel>`
    })

    //APPEND THE PANEL
    panelDown.innerHTML = ''
    panelDown.label = `Canberra suburbs`
    panelDown.appendChild(urbanDownPanel)
}

