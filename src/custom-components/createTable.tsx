import * as OBC from '@thatopen/components'
import * as BUI from '@thatopen/ui'
import * as OBCF from '@thatopen/components-front'


const onSearch = (e: Event, table:BUI.Table<any>) => {
    const input = e.target as BUI.TextInput;
    table.queryString = input.value !== "" ? input.value : null
}
const onClearPanel = async (panel: BUI.Panel, title:string='Void Panel') => {
    panel.innerHTML = ''
    panel.label = title
}
const onSortTable = (table:BUI.Table<any>, field:string, ascending:boolean=true) => {
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

    for (const suburb of table.data){
        if (!suburb.children) continue;
        (suburb.children as BUI.TableGroupData<any>[]).sort((a, b) => {
            const valA = a.data[field]
            const valB = b.data[field]
            // Se entrambi sono numeri
            if (typeof valA === 'number' && typeof valB === 'number') {
                return (valA - valB) * direction
            }
            // Ordinamento alfabetico
            return valA.toString().localeCompare(valB.toString()) * direction
        })
        for (const block of suburb.children){
            if (!block.children) continue
            (block.children as BUI.TableGroupData<any>[]).sort((a, b) => {
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
    }

    table.requestUpdate()
}

export async function createTable (panelDown:BUI.Panel,fragments:OBC.FragmentsManager,components:OBC.Components,paramOne:string='Concret',paramTwo:string='Glass'): Promise<BUI.Table<any>> {

    const highlighter = components.get(OBCF.Highlighter)
    await onClearPanel(panelDown)

    //CREATE THE TABLE
    type tableType = {
        model:string,
        localId:number,
        Suburb: string,
        Param1: number,
        Param2: number,
        Color:any,
    }
    const urbanTable = document.createElement("bim-table") as BUI.Table<tableType>
    urbanTable.id = 'urban-table'
    urbanTable.data = [{
        data: {
            Suburb: '',
            Param1: 1,
            Param2: 1,
            Color: '',
        }
    }]
    urbanTable.data = []
    urbanTable.preserveStructureOnFilter = true
    urbanTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
    urbanTable.hiddenColumns = ['model', 'localId']

    for (const [modelName,model] of fragments.list.entries()){
        if (modelName.includes('DELTA')) continue
        const items = await model.getItems()
        for (const [id,data] of items.entries()){
            let color: string = ''
            switch (true) {
                case (highlighter.selection.color_0_02?.[modelName]?.has(id)): //optional chaining check needed because sometimes some ranges are empty
                    color = highlighter.styles.get('color_0_02')?.color.getStyle()!
                    break;
                case (highlighter.selection.color_02_04?.[modelName]?.has(id)):
                    color = highlighter.styles.get('color_02_04')?.color.getStyle()!
                    break;
                case (highlighter.selection.color_04_06?.[modelName]?.has(id)):
                    color = highlighter.styles.get('color_04_06')?.color.getStyle()!
                    break;
                case (highlighter.selection.color_06_08?.[modelName]?.has(id)):
                    color = highlighter.styles.get('color_06_08')?.color.getStyle()!
                    break;
                case (highlighter.selection.color_08_1?.[modelName]?.has(id)):
                    color = highlighter.styles.get('color_08_1')?.color.getStyle()!
                    break;
            }
            urbanTable.data.push({
                data: {
                    model: modelName,
                    localId: id,
                    Suburb: data.data.Suburb.value,
                    Param1: Math.round(data.data[paramOne].value*1000)/1000,
                    Param2: Math.round(data.data[paramTwo].value*1000)/1000,
                    Color: color,
                }
            })
        }
    }
    urbanTable.dataTransform.Suburb = (value, rowData) => { //color also the total resource cost in the table with the same color of related element
        const { model, localId } = rowData
        return BUI.html`
            <bim-label 
                @click=${() => {
                    highlighter.highlightByID("select", {[model as string]: new Set<number>([localId as number])}, false, true)
                    }}
                @mouseover=${({target}:{target:BUI.Label}) => {target.style.color = "rgba(36, 241, 234, 1)"}}
                @mouseleave=${({target}:{target:BUI.Label}) => {target.style.removeProperty('color')}}
            >
                ${value}
            </bim-label>`
    }
    urbanTable.dataTransform.Color = (value) => { //color also the total resource cost in the table with the same color of related element
        return BUI.html`<div style="height:1rem; width: 1rem; border-radius:5px; background-color:${value}; color:${value};">.</div>`
    }

    const sortByColumn = BUI.Component.create<BUI.Dropdown>(
        () => BUI.html`
            <bim-dropdown name="sortTable" style="max-width:fit-content"
                @change="${(e:Event) => {
                    if (!e.target) return
                    const ascending = sortByDirection.icon=='meteor-icons:arrow-up' ? false : true
                    onSortTable(urbanTable, (e.target as any).value[0]), ascending}}">
                <bim-option style="padding:0 0.5rem 0 0.5rem" label="Suburb" value="Suburb" icon='lets-icons:map-light'></bim-option>
                <bim-option style="padding:0 0.5rem 0 0.5rem" label=${paramOne} value='Param1' icon='icon-park-outline:one-key'></bim-option>
                <bim-option style="padding:0 0.5rem 0 0.5rem" label=${paramTwo} value='Param2' icon='icon-park-outline:two-key'></bim-option>
            </bim-dropdown>`,
    )
    const sortByDirection = BUI.Component.create<BUI.Dropdown>(
        () => BUI.html`
            <bim-button icon='meteor-icons:arrow-up' style="max-width:fit-content; z-index:100" tooltip-text='Ascending or descending order'
                @click="${(e:Event) => {
                    if (!e.target) return
                    const button = e.target as BUI.Button
                    button.icon = button.icon=='meteor-icons:arrow-up' ? 'meteor-icons:arrow-down' : 'meteor-icons:arrow-up'
                    const ascending = button.icon=='meteor-icons:arrow-up' ? false : true
                    onSortTable(urbanTable, sortByColumn.value[0], ascending)}}">
            </bim-button>`,
    )

    //CREATE THE PANEL
    const urbanDownPanel = BUI.Component.create<BUI.Panel>(() => {
        return BUI.html`
        <bim-panel style="display:flex; flex-direction:column; gap:10px; margin:10px; background-color:transparent; flex:1;">
            <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px'})}>
                <div style="display: flex; gap: 0.5rem;">
                    <bim-label>Sort by:</bim-label>
                    ${sortByColumn}
                    ${sortByDirection}
                    <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,urbanTable)}}></bim-text-input>
                    <bim-button @click=${() => {onClearPanel(panelDown)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                    <bim-button tooltip-text="Click on item's name to add it to the selection" icon='majesticons:lightbulb-shine' style="max-width:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                </div>
                ${urbanTable}
            </div>
        </bim-panel>`
    })

    //APPEND THE PANEL
    panelDown.label = `CANBERRA SUBURBS`
    panelDown.appendChild(urbanDownPanel)
    
    return urbanTable
}