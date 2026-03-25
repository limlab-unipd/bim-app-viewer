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
import Stats from 'stats.js'

type ViewerCleanup = () => void
type NestedModelMap<T> = Record<string, Record<string | number, T>>
type ItemWithLocalId = { _localId?: { value?: unknown } }
type ModelItemCache = Map<string, Map<number, FRAGS.ItemData>>
type FilteredCostItemsByModel = Record<string, FRAGS.ItemData[]>
type CostGroupSummary = {
    cost: number
    currency: string
    model?: string
    itemId?: number
    costItemUnitCost?: string | number
    costItemDescription?: string
    ComponentsValue?: unknown
}
type ResourceGroupSummary = {
    resourceCost: number
    currency: string
    resourceDescription?: string
    resourceUnitCost?: string
    model?: string
    itemId?: number
}
type ResourceDetail = {
    resourceUnitCost: string
    elemQuantity: string
    resourceDescription: string
    resourceName: string
}
type CategoryElementResource = {
    elemModel: string
    elemId: number
    elemName: string
    totalResourceCost: number
    currency: string
}
type DynamicResourceTableData = {
    Model?: string
    ItemId?: number
    ElementName: string
    ElementIfcClass: string
    ResourceName: string
    ResourceDescription: string
    ResourceCost: string
    ResourceUnitCost: string
    ElementQuantity: string
    NormalizedValue: string
}
type DynamicCostTableData = {
    ElementName: string
    ElementIfcClass: string
    Cost: number | string
    Quantity: number | string
    Currency: string
    CostItemName: string
    CostItemDescription: string
    CostItemUnitCost: number | string
    ComponentsCostValues: unknown
    Model?: string
    ItemId?: number
    ItemVolume?: number
    NormalizedCost?: number
    NormalizedValue?: number
}
type ResourceModelAnalysisResult = {
    model: string
    resourceCurrency: string
    elemResourcesMap: Record<number, number>
    elemCostCountMap: Record<number, number>
    categoryElementsMap: Record<string, CategoryElementResource[]>
    elemResourcesDetailsMap: Record<number, ResourceDetail[]>
}
type TotalCostModelAnalysisResult = {
    model: string
    modelCostMap: Record<number, number>
    modelCostCountMap: Record<number, number>
    itemVolumeMap: Record<number, number | undefined>
    panelRows: BUI.TableGroupData<DynamicCostTableData>[]
}
type RenderElementCostPanelOptions = {
    rows: BUI.TableGroupData<DynamicCostTableData>[]
    normalization?: boolean
    colorMap?: Record<string, string>
    hasAssignments?: boolean
}

const COST_TRANSPARENT_STYLE_IDS = [
    'color_0_02_transparent',
    'color_02_04_transparent',
    'color_04_06_transparent',
    'color_06_08_transparent',
    'color_08_1_transparent',
] as const

const IMPORTED_CATEGORIES = (() => {
    const ifcImporter = new FRAGS.IfcImporter()
    const categories = getIFCClassNamesFromCodes([...ifcImporter.classes.elements])
    categories.push('ALL CLASSES', 'IFCBUILTSYSTEM')
    categories.sort()
    return categories
})()

const getFileStem = (fileName: string, extension?: string) => {
    if (!extension) return fileName.split('.').slice(0, -1).join('.') || fileName
    return fileName.split(extension)[0] || fileName
}

const getLocalId = (item: ItemWithLocalId | null | undefined): number | undefined => {
    const value = item?._localId?.value
    return typeof value === 'number' ? value : undefined
}

const mapItemsByLocalId = <T extends ItemWithLocalId>(items: T[] = []) => {
    const itemsMap: Record<number, T> = {}
    for (const item of items) {
        const localId = getLocalId(item)
        if (typeof localId === 'number') itemsMap[localId] = item
    }
    return itemsMap
}

const mapItemsByLocalIdToMap = <T extends ItemWithLocalId>(items: T[] = []) => {
    const itemsMap = new Map<number, T>()
    for (const item of items) {
        const localId = getLocalId(item)
        if (typeof localId === 'number') {
            itemsMap.set(localId, item)
        }
    }
    return itemsMap
}

const getItemAttributeValue = (item: FRAGS.ItemData | undefined, key: string) => {
    return (item?.[key] as FRAGS.ItemAttribute | undefined)?.value as any | undefined
}

const getItemRelationArray = (item: FRAGS.ItemData | undefined, key: string) => {
    return item?.[key] as FRAGS.ItemData[] | undefined
}

const parseSortableValue = (value: unknown): number | string => {
    const normalizedValue = String(value ?? '')
    const numericPart = normalizedValue.split(' ')[0]
    const parsed = Number(numericPart)
    if (!Number.isNaN(parsed) && normalizedValue.trim().startsWith(numericPart)) {
        return parsed
    }
    return normalizedValue.toLowerCase()
}

const flattenModelMap = <T,>(map: NestedModelMap<T>) => {
    const flattenedMap: Record<string | number, T> = {}
    for (const currentMap of Object.values(map)) {
        for (const [key, value] of Object.entries(currentMap)) {
            flattenedMap[key] = value
        }
    }
    return flattenedMap
}

const cleanModelIdMap = (modelIdMap?: OBC.ModelIdMap | null) => {
    const cleanedModelIdMap: OBC.ModelIdMap = {}
    if (!modelIdMap) return cleanedModelIdMap

    for (const [modelId, ids] of Object.entries(modelIdMap)) {
        if (ids instanceof Set && ids.size > 0) {
            cleanedModelIdMap[modelId] = ids
        }
    }

    return cleanedModelIdMap
}

const getCategoriesCacheKey = (categories: string[]) => (
    [...categories]
        .filter((category) => category !== 'ALL CLASSES')
        .sort()
        .join('|')
)

export function MainViewer () {

    // #region GENERAL START
    //BUI.Manager.init()
    const componentsRef = React.useRef<OBC.Components | null>(null)
    if (!componentsRef.current) {
        componentsRef.current = new OBC.Components()
    }
    const components = componentsRef.current
    const importedCategories = IMPORTED_CATEGORIES
    // #endregion
    
    const setViewer = async (devMode:boolean=false): Promise<ViewerCleanup> => {
        //SETTING DEV MODE
        const devElementsVisibility = devMode ? '' : 'none' 
        //VIEWER COMPONENTS
        const finder = components.get(OBC.ItemsFinder)
        const highlighter = components.get(OBCF.Highlighter)
        const ifcLoader = components.get(OBC.IfcLoader)
        const fragments = components.get(OBC.FragmentsManager)
        const hider = components.get(OBC.Hider)
        const cleanupCallbacks: ViewerCleanup[] = []
        const overlayTimeouts = new Set<number>()
        const createdObjectUrls = new Set<string>()
        const contextMenuOutsideClickHandlers = new WeakMap<BUI.Label, EventListener>()
        const trackedContextMenuLabels = new Set<BUI.Label>()
        const registerCleanup = (cleanup: ViewerCleanup) => {
            cleanupCallbacks.push(cleanup)
        }
        const trackObjectUrl = (url: string) => {
            createdObjectUrls.add(url)
            return url
        }
        const cleanupViewer = () => {
            for (const timeoutId of overlayTimeouts) {
                window.clearTimeout(timeoutId)
            }
            overlayTimeouts.clear()

            for (const label of trackedContextMenuLabels) {
                const registeredHandler = contextMenuOutsideClickHandlers.get(label)
                if (registeredHandler) {
                    document.removeEventListener('click', registeredHandler, true)
                }
            }
            trackedContextMenuLabels.clear()

            for (const objectUrl of createdObjectUrls) {
                URL.revokeObjectURL(objectUrl)
            }
            createdObjectUrls.clear()

            while (cleanupCallbacks.length > 0) {
                cleanupCallbacks.pop()?.()
            }
        }
        const geometryIdsCache = new Map<string, number[]>()
        const filteredCostItemsCache = new Map<string, FilteredCostItemsByModel>()
        const itemDataCache: ModelItemCache = new Map()
        const itemsWithAssignmentsCache: ModelItemCache = new Map()
        const costValuesShallowCache: ModelItemCache = new Map()
        const costValuesAppliedCache: ModelItemCache = new Map()
        const costValuesDeepCache: ModelItemCache = new Map()
        const unitBasisCache: ModelItemCache = new Map()
        const componentsCache: ModelItemCache = new Map()
        const priceAnalysisComponentCache: ModelItemCache = new Map()
        const costItemsWithValuesCache: ModelItemCache = new Map()
        const itemVolumeCache = new Map<string, Map<number, number | undefined>>()
        const clearAnalysisCaches = () => {
            geometryIdsCache.clear()
            filteredCostItemsCache.clear()
            itemDataCache.clear()
            itemsWithAssignmentsCache.clear()
            costValuesShallowCache.clear()
            costValuesAppliedCache.clear()
            costValuesDeepCache.clear()
            unitBasisCache.clear()
            componentsCache.clear()
            priceAnalysisComponentCache.clear()
            costItemsWithValuesCache.clear()
            itemVolumeCache.clear()
        }
        const getCacheBucket = (cache: ModelItemCache, modelId: string) => {
            let bucket = cache.get(modelId)
            if (!bucket) {
                bucket = new Map<number, FRAGS.ItemData>()
                cache.set(modelId, bucket)
            }
            return bucket
        }
        const getCachedFragmentsDataByIds = async (
            cache: ModelItemCache,
            modelId: string,
            ids: Iterable<number>,
            loader: (missingIds: number[]) => Promise<FRAGS.ItemData[]>,
        ) => {
            const bucket = getCacheBucket(cache, modelId)
            const normalizedIds = [...new Set(ids)].filter((id) => Number.isFinite(id))
            const missingIds = normalizedIds.filter((id) => !bucket.has(id))
            if (missingIds.length > 0) {
                const loadedItems = await loader(missingIds)
                for (const item of loadedItems) {
                    const localId = getLocalId(item)
                    if (typeof localId === 'number') {
                        bucket.set(localId, item)
                    }
                }
            }
            return bucket
        }
        const getCachedModelItemsData = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                itemDataCache,
                modelId,
                ids,
                async (missingIds) => await fragments.list.get(modelId)?.getItemsData(missingIds) ?? [],
            )
        }
        const getCachedItemsWithAssignments = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                itemsWithAssignmentsCache,
                modelId,
                ids,
                async (missingIds) => {
                    const record = await fragments.getData(
                        { [modelId]: new Set<number>(missingIds) },
                        {
                            attributesDefault: true,
                            relations: {
                                HasAssignments: {
                                    attributes: true,
                                    relations: false,
                                },
                            },
                        },
                    )
                    return record[modelId] as FRAGS.ItemData[] ?? []
                },
            )
        }
        const getCachedCostValuesShallow = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                costValuesShallowCache,
                modelId,
                ids,
                async (missingIds) => {
                    const record = await fragments.getData(
                        { [modelId]: new Set<number>(missingIds) },
                        {
                            attributesDefault: true,
                            relationsDefault: {
                                attributes: true,
                                relations: false,
                            },
                        },
                    )
                    return record[modelId] as FRAGS.ItemData[] ?? []
                },
            )
        }
        const getCachedCostValuesApplied = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                costValuesAppliedCache,
                modelId,
                ids,
                async (missingIds) => {
                    const record = await fragments.getData(
                        { [modelId]: new Set<number>(missingIds) },
                        {
                            attributesDefault: true,
                            relations: {
                                AppliedValue: {
                                    attributes: true,
                                    relations: false,
                                },
                            },
                        },
                    )
                    return record[modelId] as FRAGS.ItemData[] ?? []
                },
            )
        }
        const getCachedCostValuesDeep = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                costValuesDeepCache,
                modelId,
                ids,
                async (missingIds) => {
                    const record = await fragments.getData(
                        { [modelId]: new Set<number>(missingIds) },
                        {
                            attributesDefault: true,
                            relationsDefault: {
                                attributes: true,
                                relations: true,
                            },
                        },
                    )
                    return record[modelId] as FRAGS.ItemData[] ?? []
                },
            )
        }
        const getCachedUnitBasis = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                unitBasisCache,
                modelId,
                ids,
                async (missingIds) => {
                    const record = await fragments.getData(
                        { [modelId]: new Set<number>(missingIds) },
                        {
                            attributesDefault: true,
                            relationsDefault: {
                                attributes: true,
                                relations: false,
                            },
                        },
                    )
                    return record[modelId] as FRAGS.ItemData[] ?? []
                },
            )
        }
        const getCachedComponents = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                componentsCache,
                modelId,
                ids,
                async (missingIds) => {
                    const record = await fragments.getData(
                        { [modelId]: new Set<number>(missingIds) },
                        {
                            attributesDefault: true,
                            relationsDefault: {
                                attributes: true,
                                relations: true,
                            },
                        },
                    )
                    return record[modelId] as FRAGS.ItemData[] ?? []
                },
            )
        }
        const getCachedPriceAnalysisComponents = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                priceAnalysisComponentCache,
                modelId,
                ids,
                async (missingIds) => {
                    const record = await fragments.getData(
                        { [modelId]: new Set<number>(missingIds) },
                        {
                            attributesDefault: true,
                            relationsDefault: {
                                attributes: true,
                                relations: true,
                            },
                        },
                    )
                    return record[modelId] as FRAGS.ItemData[] ?? []
                },
            )
        }
        const getCachedCostItemsWithValues = async (modelId: string, ids: Iterable<number>) => {
            return getCachedFragmentsDataByIds(
                costItemsWithValuesCache,
                modelId,
                ids,
                async (missingIds) => {
                    const record = await fragments.getData(
                        { [modelId]: new Set<number>(missingIds) },
                        {
                            attributesDefault: true,
                            relations: {
                                CostValues: {
                                    attributes: true,
                                    relations: false,
                                },
                            },
                        },
                    )
                    return record[modelId] as FRAGS.ItemData[] ?? []
                },
            )
        }
        const getCachedGeometryIds = async (modelId: string) => {
            const cachedGeometryIds = geometryIdsCache.get(modelId)
            if (cachedGeometryIds) return cachedGeometryIds
            const geometryIds = await fragments.list.get(modelId)?.getItemsIdsWithGeometry() ?? []
            geometryIdsCache.set(modelId, geometryIds)
            return geometryIds
        }
        const getCachedItemVolumes = async (modelId: string, ids: Iterable<number>) => {
            let bucket = itemVolumeCache.get(modelId)
            if (!bucket) {
                bucket = new Map<number, number | undefined>()
                itemVolumeCache.set(modelId, bucket)
            }

            const normalizedIds = [...new Set(ids)].filter((id) => Number.isFinite(id))
            const missingIds = normalizedIds.filter((id) => !bucket.has(id))
            if (missingIds.length > 0) {
                const itemVolumes = await fragments.list.get(modelId)?.getItemsVolume(missingIds)
                if (Array.isArray(itemVolumes)) {
                    missingIds.forEach((itemId, index) => {
                        bucket?.set(itemId, itemVolumes[index])
                    })
                } else if (typeof itemVolumes === 'number' && missingIds.length === 1) {
                    bucket.set(missingIds[0], itemVolumes)
                } else {
                    missingIds.forEach((itemId) => {
                        bucket?.set(itemId, undefined)
                    })
                }
            }

            return bucket
        }
        const getFilteredCostItems = async (categories: string[]) => {
            const cacheKey = getCategoriesCacheKey(categories)
            const cachedCostItems = filteredCostItemsCache.get(cacheKey)
            if (cachedCostItems) {
                return cachedCostItems
            }

            finder.create('COSTITEM_REL_CATEGORY', [
                {
                    categories: [/COSTITEM/],
                    relation: {
                        name: "Controls",
                        query: {
                            categories: categories.map((category) => new RegExp(`^${category}$`)),
                        },
                    },
                },
            ])

            const costItemIdsByModel = cleanModelIdMap(
                await finder.list.get('COSTITEM_REL_CATEGORY')?.test(),
            )
            if (Object.keys(costItemIdsByModel).length === 0) {
                filteredCostItemsCache.set(cacheKey, {})
                return {}
            }

            const filteredCostItems = await fragments.getData(costItemIdsByModel, {
                attributesDefault: true,
                attributes: ['ObjectType'],
                relations: {
                    Controls: { attributes: true, relations: false },
                    CostValues: { attributes: true, relations: false },
                },
            }) as FilteredCostItemsByModel

            filteredCostItemsCache.set(cacheKey, filteredCostItems)
            return filteredCostItems
        }
        const isModelIdMapSelected = (modelIdMap: OBC.ModelIdMap, modelId: string, itemId?: number) => {
            if (typeof itemId !== 'number') return false
            return modelIdMap[modelId]?.has(itemId) ?? false
        }
        const addToModelIdMap = (modelIdMap: OBC.ModelIdMap, modelId: string, itemId: number) => {
            if (!modelIdMap[modelId]) {
                modelIdMap[modelId] = new Set<number>()
            }
            modelIdMap[modelId].add(itemId)
        }
        const mergeCategoryElementsMap = (
            target: Record<string, CategoryElementResource[]>,
            source: Record<string, CategoryElementResource[]>,
        ) => {
            for (const [category, elements] of Object.entries(source)) {
                target[category] ? target[category].push(...elements) : target[category] = [...elements]
            }
        }
        const mergeResourceDetailsMap = (
            target: Record<number, ResourceDetail[]>,
            source: Record<number, ResourceDetail[]>,
        ) => {
            for (const [itemId, details] of Object.entries(source)) {
                const normalizedItemId = Number(itemId)
                target[normalizedItemId]
                    ? target[normalizedItemId].push(...details)
                    : target[normalizedItemId] = [...details]
            }
        }
        
        let previousSelection: OBC.ModelIdMap = {}

        // #region SET THREE VIEWER
        //SINGLE VIEWER
        const worlds = components.get(OBC.Worlds)
        const world = worlds.create<
            OBC.SimpleScene,
            OBC.OrthoPerspectiveCamera,
            //OBC.SimpleRenderer
            OBCF.PostproductionRenderer
        >()
        //SCENE
        world.scene = new OBC.SimpleScene(components)
        world.scene.setup()
        world.scene.three.background = new THREE.Color('rgb(53, 53, 70)')
        //RENDERER
        const container = document.getElementById("main-viewer") as HTMLElement | null
        if (!container) {
            return cleanupViewer
        }
        world.renderer = new OBCF.PostproductionRenderer(components, container)
        //world.renderer = new OBC.SimpleRenderer(components, container)
        //CAMERA
        world.camera = new OBC.OrthoPerspectiveCamera(components)
        await world.camera.controls.setLookAt(30,30,30,0,0,0) // convenient position for the model we will load
        // #endregion

        // #region COPONENTS GENERAL SETUP
        //INITIALIZE ALL COMPONENTS
        components.init()

        const grids = components.get(OBC.Grids)
        const grid = grids.create(world)
        grid.config.color.set('rgba(28, 28, 28, 1)')
        
        world.renderer.postproduction.enabled = true
        world.dynamicAnchor = false

        //components.get(OBC.Raycasters).get(world);

        const axes = new THREE.AxesHelper(1);
        world.scene.three.add(axes);

        highlighter.zoomToSelection = true;
        highlighter.setup({
            world,
            selectMaterialDefinition: {
                // you can change this to define the color of your highligthing
                color: new THREE.Color("rgba(36, 241, 234, 1)"),
                opacity: 1,
                transparent: false,
                renderedFaces: 0,
            },
        })
        highlighter.events.select.onHighlight.add((modelIdMap) => {
            previousSelection = structuredClone(modelIdMap)
        });
        highlighter.styles.set('transparent', {
            // you can change this to define the color of your highligthing
            color: new THREE.Color("rgba(123, 123, 123, 1)"),
            opacity: 0.3,
            transparent: true,
            renderedFaces: 0, //render only front side
        })

        await ifcLoader.setup({
            autoSetWasm: false,
            wasm: {
                path: "https://unpkg.com/web-ifc@0.0.75/",
                absolute: true,
            },
        });
        const workerUrl ="/Worker/worker.mjs";
        //const workerUrl ="https://thatopen.github.io/engine_fragment/resources/worker.mjs";
        const fetchedUrl = await fetch(workerUrl);
        const workerBlob = await fetchedUrl.blob();
        const workerFile = new File([workerBlob], "worker.mjs", {
            type: "text/javascript",
        });
        const workerURL = trackObjectUrl(URL.createObjectURL(workerFile));
        fragments.init(workerURL);
    
        const onCameraRest = () => fragments.core.update(true)
        world.camera.controls?.addEventListener("rest", onCameraRest);
        registerCleanup(() => {
            world.camera.controls?.removeEventListener("rest", onCameraRest)
        })
    
        fragments.list.onItemSet.add(({ value: model }) => {
            clearAnalysisCaches()
            model.useCamera(world.camera.three)
            world.scene.three.add(model.object)
            fragments.core.update(true)
        })
        fragments.core.models.materials.list.onItemSet.add(({ value: material }) => {
            const isolatedMaterials = world.renderer.postproduction.basePass.isolatedMaterials
            const isLodMaterial = "isLodMaterial" in material && material.isLodMaterial
            if (isLodMaterial && !isolatedMaterials.includes(material)) {
                isolatedMaterials.push(material)
            }
            const isShadowMaterial = "isShadowMaterial" in material && material.isShadowMaterial
            if (isShadowMaterial && !isolatedMaterials.includes(material)) {
                isolatedMaterials.push(material)
            }
        })
        const onColorByCost = async ({target}: {target: BUI.Button | string}) => {
            const startTimeTot = performance.now()
            updateCountLabel({countItems:'loading...', countCostItems:'loading...', countResources:'loading...'})

            const btn = typeof target === 'string' ? target : target.label
            let [resource] = resourcesDropdown.value
            const [normalization] = unitMeasureDropdown.value
            const [colorscale = 'gnylrd'] = colorScaleDropdown.value.length > 0 ? colorScaleDropdown.value : ['gnylrd']
            const selectedCategories = (
                categoriesDropdown.value.length === 0 || categoriesDropdown.value.includes('ALL CLASSES')
                    ? importedCategories
                    : categoriesDropdown.value
            ).filter((category) => category !== 'ALL CLASSES')

            resource = resource ?? 'TotalCost'
            if (!resource || selectedCategories.length === 0) {
                updateCountLabel({countItems:0, countCostItems:0, countResources:0})
                return
            }

            onClearPanel(panelDown)
            onClearPanel(panelRight)
            panelDown.appendChild(loadingLabel)
            panelDown.label = resource !== 'TotalCost' ? `${resource} Resource Cost` : 'Elements Total Cost'

            const gridLayout = floatingGrid.layout as any
            if (!gridLayout.includes('down')) {
                onSetLayout({target:'down'})
            }

            const startTimeFilteredCostItems = performance.now()
            const filteredCostItems = await getFilteredCostItems(selectedCategories)
            const filteredCostItemsElapsed = ((performance.now() - startTimeFilteredCostItems) / 1000).toFixed(2)
            console.log(`TIME ${filteredCostItemsElapsed} s: find and load cost items related to selected categories`)

            if (Object.keys(filteredCostItems).length === 0) {
                panelDown.innerHTML = `
                    <bim-label style="padding:1rem; padding-bottom:0.25rem;"><strong>Any COST ITEM related to:</strong></bim-label>
                    <bim-label style="display:flex; padding:1rem; padding-top:0px; white-space:normal">${selectedCategories.join(", ")}.</bim-label>
                `
                updateCountLabel({countItems:0, countCostItems:0, countResources:0})
                return
            }

            if (resource !== 'TotalCost') {
                await runResourceCostAnalysis({
                    btn,
                    resource,
                    colorscale,
                    filteredCostItems,
                })
            } else {
                await runTotalCostAnalysis({
                    btn,
                    colorscale,
                    filteredCostItems,
                    normalization,
                })
            }

            const totalElapsed = ((performance.now() - startTimeTot) / 1000).toFixed(2)
            console.log(`TIME ${totalElapsed} s: total time to complete the whole process of coloring`)
        }
        // #endregion

        //postproduction parameters
        const { aoPass } = world.renderer.postproduction
        const aoParameters = {
            radius: 0.25,
            distanceExponent: 1,
            thickness: 1,
            scale: 1,
            samples: 16,
            distanceFallOff: 1,
            screenSpaceRadius: true,
        }
        const pdParameters = {
            lumaPhi: 10,
            depthPhi: 2,
            normalPhi: 3,
            radius: 4,
            radiusExponent: 1,
            rings: 2,
            samples: 16,
        }
        aoPass.updateGtaoMaterial(aoParameters)
        aoPass.updatePdMaterial(pdParameters)
        const setAmbientOcclusionParameters = (value:number) => {
            aoPass.blendIntensity = value
            aoParameters.radius = value
            aoParameters.distanceExponent = value*4
            aoParameters.thickness = value*10
            aoParameters.distanceFallOff = value
            aoParameters.scale = value*2
            aoParameters.samples = Math.floor(value*32)
            aoPass.updateGtaoMaterial(aoParameters)
        }

        //start the viewer with the postproduction set but not enabled
        world.renderer.postproduction.enabled = false
    
        // #region LOGIC FUNCTIONS
        //function to load the IFC file
        const loadIfcFile = async (path: string, fileName: string) => {
            const name = getFileStem(fileName, '.ifc')
            const file = await fetch(path);
            const data = await file.arrayBuffer();
            const buffer = new Uint8Array(data);
            const startTime = performance.now(); // Start timer

            //THIS IS THE MOST FUNDAMENTAL THING FOR ADDING CLASSES TO IMPORT.
            //FRAGMENTS 2.0 DOES NOT IMPORT BY DEFAULT ALL THE IFC CLASSES
            await ifcLoader.load(
                buffer,
                false, //coordinate model
                name,
                {instanceCallback(importer) {
                    //ADDING NEW CLASSES TO IMPORT
                    importer.classes['abstract'].add(
                        WEBIFC.IFCCOSTITEM,
                        WEBIFC.IFCCOSTVALUE,
                        WEBIFC.IFCMEASUREWITHUNIT,
                        WEBIFC.IFCMONETARYUNIT,
                        WEBIFC.IFCSIUNIT,
                        WEBIFC.IFCCONVERSIONBASEDUNIT,
                        WEBIFC.IFCCONTEXTDEPENDENTUNIT,
                        WEBIFC.IFCRELASSIGNSTOCONTROL,
                        WEBIFC.IFCRELNESTS,
                        WEBIFC.IFCRELCONNECTSPATHELEMENTS,
                        WEBIFC.IFCRELDEFINESBYTYPE,
                        //non importa tutte le classi dei type
                    )
                    importer.classes['elements'].add(
                        WEBIFC.IFCBUILTSYSTEM //remember to add these classes also above in the importedClasses in the initial part of the script !!!
                    )
                    //ADDING NEW RELATIONS TO IMPORT
                    importer.relations.set(WEBIFC.IFCRELASSIGNSTOCONTROL, {
                        forRelated: "HasAssignments",
                        forRelating: "Controls"
                    })
                    importer.relations.set(WEBIFC.IFCRELNESTS, {
                        forRelated: "Nests",
                        forRelating: "IsNestedBy"
                    })
                    importer.relations.set(WEBIFC.IFCRELCONNECTSPATHELEMENTS, {
                        forRelated: "ConnectedTo",
                        forRelating: "ConnectedFrom"
                    })
                    importer.relations.set(WEBIFC.IFCRELDEFINESBYTYPE, {
                        forRelated: "IsTypedBy",
                        forRelating: "Types"
                    })
                }
            });

            const endTime = performance.now(); // End timer
            const loadTime = ((endTime - startTime) / 1000).toFixed(2); // seconds
            console.log(`${name} IFC model loaded in ${loadTime} seconds`);
            addOverlay(BUI.html`<i><b>${name}</i></b> loaded in <b>${loadTime}</b> seconds.`)
        }
        // Function to load an IFC file triggered by the button
        const onLoadIfc = async ({target}:{target:BUI.Button}) => {
            //methods to open the file dialog and select an IFC file
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".ifc";
            input.onchange = async (event) => {
                const file = (event.target as HTMLInputElement).files?.[0];
                if (!file) return

                const url = URL.createObjectURL(file);
                target.loading = true; // Set loading state
                target.label = "Loading IFC...";
                try {
                    await loadIfcFile(url,file.name);
                } finally {
                    target.loading = false; // Set loading state
                    target.label = ""
                    URL.revokeObjectURL(url);
                }
            };
            input.click();
        }

        // handle fragment files
        const loadFragmentFile = async (path:string, explicitModelId?: string) => {
            const startTime = performance.now() // Start timer
            const modelId = explicitModelId ?? getFileStem(path.split("/").pop() ?? path)
            if (modelId) {
                const file = await fetch(path)
                const buffer = await file.arrayBuffer()
                await fragments.core.load(buffer, { modelId: modelId })
            }
            const endTime = performance.now() // End timer
            const loadTime = ((endTime - startTime) / 1000).toFixed(2) // seconds
            console.log(`Fragments loaded in ${loadTime} seconds`)
            addOverlay(BUI.html`<b><i>${modelId}</i></b> model loaded in <b>${loadTime}</b> seconds.`)
        }
        const onFragmentsExport = async () => {
            for (const [, model] of fragments.list) {
                const fragsBuffer = await model.getBuffer(false);
                const file = new File([fragsBuffer], `${model.modelId}.frag`)
                const link = document.createElement("a")
                link.href = URL.createObjectURL(file)
                link.download = file.name
                link.click()
                URL.revokeObjectURL(link.href)
            }
        }
        const onFragmentsImport = async () => {
            const input = document.createElement('input')
            input.type = 'file'
            input.multiple = true
            input.accept = '.frag'
            input.onchange = async (event) => {
                const files = (event.target as HTMLInputElement).files
                if (!files) return
                const fragmentFiles = Array.from(files).map((file) => ({
                    path: URL.createObjectURL(file),
                    modelId: getFileStem(file.name, '.frag'),
                }))
                try {
                    // Promise.all loads models concurrently for faster execution.
                    await Promise.all(
                        fragmentFiles.map(({ path, modelId }) => loadFragmentFile(path, modelId)),
                    )
                } finally {
                    for (const { path } of fragmentFiles) {
                        URL.revokeObjectURL(path)
                    }
                }
            }
            input.click()
        }
        const onFragmentsPrint = async () => { //test function on fragments
            //it doesn't work with non geometric elements (IfcCostItem)
            const selection = highlighter.selection.select //modelIdMap -> association to exp id
            console.log("ModelIdMap: ", selection)
            const itemdata = await fragments.getData(selection) //frags.itemdata -> attributes, guid and expid (localId)
            console.log("ItemData: ", itemdata)
        }

        //generic functions
        //Visibility
        const onHide = async () => {
            hider.set(false, highlighter.selection.select)
        }
        const onIsolate = () => {
            hider.isolate(highlighter.selection.select)
        }
        const onResetVisibility = () => {
            hider.set(true) //show all items
            fragments.resetHighlight() //reset colors or other overrides
            highlighter.clear()
        }
        const onInvertVisibility = async () => {
            for (const [,model] of fragments.list){
                const visible = await model.getItemsByVisibility(true)
                const hidden = await model.getItemsByVisibility(false)
                model.toggleVisible([...visible,...hidden])
            }
        }
        const onSetTransparency = (modelIdMap?:OBC.ModelIdMap|null) => {
            if (!modelIdMap) { modelIdMap = highlighter.selection.select }
            highlighter.highlightByID('transparent', modelIdMap, false, false)
        }
        const onSetTransparencyToNotSelectedElements = async () => {
            const allItems = await getAllItems()
            const selectedItems = highlighter.selection.select
            highlighter.highlightByID('transparent', allItems, true, false, selectedItems)
        }
        const updateCostTransparentOpacity = async (opacity: number) => {
            for (const styleId of COST_TRANSPARENT_STYLE_IDS) {
                const style = highlighter.styles.get(styleId) as { opacity?: number } | undefined
                if (style) {
                    style.opacity = opacity
                }
            }
            await highlighter.updateColors()
        }
        const onSetTransparencyToCostColor = async (e:Event) => {
            const selItems = highlighter.selection.select
            const button = e.target as BUI.Button
            const buttonLabel = button.label
            if (buttonLabel=='Reset'){
                highlighter.highlightByID('color_0_02', highlighter.selection.color_0_02_transparent, false, false)
                highlighter.highlightByID('color_02_04', highlighter.selection.color_02_04_transparent, false, false)
                highlighter.highlightByID('color_04_06', highlighter.selection.color_04_06_transparent, false, false)
                highlighter.highlightByID('color_06_08', highlighter.selection.color_06_08_transparent, false, false)
                highlighter.highlightByID('color_08_1', highlighter.selection.color_08_1_transparent, false, false)    
            } else if (buttonLabel=='Ghost') {
                //quando aggiorneranno i pacchetti sara' da aggiornare usando come prima direttamente il parametro exclude con setItems
                await highlighter.highlightByID('color_0_02_transparent', highlighter.selection.color_0_02, true, false)
                await highlighter.highlightByID('color_02_04_transparent', highlighter.selection.color_02_04, true, false)
                await highlighter.highlightByID('color_04_06_transparent', highlighter.selection.color_04_06, true, false)
                await highlighter.highlightByID('color_06_08_transparent', highlighter.selection.color_06_08, true, false)
                await highlighter.highlightByID('color_08_1_transparent', highlighter.selection.color_08_1, true, false)

                highlighter.highlightByID('color_0_02', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_0_02_transparent,selItems]), false, false)
                highlighter.highlightByID('color_02_04', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_02_04_transparent,selItems]), false, false)
                highlighter.highlightByID('color_04_06', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_04_06_transparent,selItems]), false, false)
                highlighter.highlightByID('color_06_08', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_06_08_transparent,selItems]), false, false)
                highlighter.highlightByID('color_08_1', OBC.ModelIdMapUtils.intersect([highlighter.selection.color_08_1_transparent,selItems]), false, false)
            } else {
                console.log('Analysis still not performed.')
            }
            //console.log(highlighter.selection)
            await highlighter.clear('select')
        }
        
        const getAllItems = async () => {
            const frMap: OBC.ModelIdMap = {}
            for (const [entry,entryfr] of fragments.list.entries()){
                const localids = await entryfr.getLocalIds()
                const singleFrMap: OBC.ModelIdMap = {
                    [entry] : new Set<number>([...localids])
                }
                Object.assign(frMap, singleFrMap)
            }
            return frMap
        }
        const getAllCategories = async () => {
            const list: string[][] = []
            for (const [entry,entryfr] of fragments.list.entries()){
                const categories = await entryfr.getCategories()
                list.push(categories)
            }
            return [...new Set(list.flat().sort())]
        }
        let previousLayout: string = 'main'
        const onSetLayout = ({target}: {target: BUI.Button | string}) => {
            const btn = typeof target==='string' ? target : target.id
            let currentLayout = floatingGrid.layout as any
            if (!currentLayout) return
            if (currentLayout == btn) {
                if (btn == 'world') {
                    floatingGrid.layout = previousLayout as any
                } else {
                    floatingGrid.layout = "main" as any
                }
            } else if (currentLayout == 'main') {
                floatingGrid.layout = btn as any
            } else {
                if (btn == 'world') {
                    floatingGrid.layout = 'world' as any
                    previousLayout = currentLayout
                } else {
                    if (currentLayout == 'world') {
                        currentLayout = ''
                    }
                    currentLayout.includes(btn) ? floatingGrid.layout = currentLayout.replace(btn, "") : floatingGrid.layout = currentLayout + btn as any
                }
            }
        }
        const onExpandTable = <TRow extends Record<string, unknown>>(e: Event, table:BUI.Table<TRow>) => {
            const button = e.target as BUI.Button;
            table.expanded = !table.expanded;
            button.label = table.expanded ? "Collapse" : "Expand";
        }
        
        const onSortDynamicTable = <TRow extends Record<string, unknown>>(
            table:BUI.Table<TRow>,
            field:string,
            ascending:boolean=true,
            totalCostPerGroupedTable: Record<string, {cost: number}>,
        ) => {
            const getSortSourceValue = (row: BUI.TableGroupData<TRow>) => {
                // se il criterio è Cost allora prende i valori di uno di quei tre campi (ElementName, CostItemName o ElementIfcClass) 
                // per identificare a quale gruppo di costo appartiene e prende il costo totale di quel gruppo dalla totalCostPerGroupedTable 
                // invece di prendere il valore del campo Cost che è vuoto nelle row raggruppate della table
                if (field === 'Cost') {
                    const rowData = row.data as {
                        ElementName?: string
                        CostItemName?: string
                        ElementIfcClass?: string
                    }
                    const groupKey =
                        rowData.ElementName ||
                        rowData.CostItemName ||
                        rowData.ElementIfcClass
                    if (groupKey && totalCostPerGroupedTable[groupKey]) {
                        return totalCostPerGroupedTable[groupKey].cost
                    }
                }
                // se il criterio è qualsiasi altro prende direttamente il suo valore
                return row.data[field as keyof TRow] ?? ''
            }
            const direction = ascending ? 1 : -1
            table.value.sort((a, b) => {
                const valA = parseSortableValue(getSortSourceValue(a))
                const valB = parseSortableValue(getSortSourceValue(b))
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return (valA - valB) * direction
                }
                return valA.toString().localeCompare(valB.toString()) * direction
            })
            table.requestUpdate()
        }
        const onSortDynamicResourceTable = <TRow extends Record<string, unknown>>(
            table:BUI.Table<TRow>,
            field:string,
            ascending:boolean=true,
            totalCostPerGroupedTable: Record<string, {resourceCost: number}>,
        ) => {
            const getSortSourceValue = (row: BUI.TableGroupData<TRow>) => {
                // se il criterio è Cost allora prende i valori di uno di quei tre campi (ElementName, CostItemName o ElementIfcClass) 
                // per identificare a quale gruppo di costo appartiene e prende il costo totale di quel gruppo dalla totalCostPerGroupedTable 
                // invece di prendere il valore del campo Cost che è vuoto nelle row raggruppate della table
                if (field === 'Cost') {
                    const rowData = row.data as {
                        ElementName?: string
                        ResourceName?: string
                        ElementIfcClass?: string
                    }
                    const groupKey =
                        rowData.ElementName ||
                        rowData.ResourceName ||
                        rowData.ElementIfcClass
                    if (groupKey && totalCostPerGroupedTable[groupKey]) {
                        return totalCostPerGroupedTable[groupKey].resourceCost
                    }
                }
                // se il criterio è qualsiasi altro prende direttamente il suo valore
                return row.data[field as keyof TRow] ?? ''
            }
            const direction = ascending ? 1 : -1
            table.value.sort((a, b) => {
                const valA = parseSortableValue(getSortSourceValue(a))
                const valB = parseSortableValue(getSortSourceValue(b))
                if (typeof valA === 'number' && typeof valB === 'number') {
                    return (valA - valB) * direction
                }
                return valA.toString().localeCompare(valB.toString()) * direction
            })
            table.requestUpdate()
        }

        const onSearch = <TRow extends Record<string, unknown>>(e: Event, table:BUI.Table<TRow>) => {
            const input = e.target as BUI.TextInput;
            table.queryString = input.value !== "" ? input.value : null
        }
        const onClearPanel = (panel: BUI.Panel, title:string='Void Panel') => {
            panel.innerHTML = ''
            panel.label = title
        }

        // #region
        //advanced functions
        const getVolume = async () => {
            const models = fragments.list.values()
            for (const model of models) {
                const selection = await model.getHighlightItemIds()
                if (!selection) continue
                const volumes = await model.getItemsVolume(selection)
                console.log(volumes)
            }
        }
        function takeScreenshot() {
            if (!world.renderer) return;
            world.renderer.three.render(world.scene.three, world.camera.three);
            const link = document.createElement("a");
            link.download = "screenshot.png";
            link.href = world.renderer.three.domElement.toDataURL();
            link.click();
        }
        const addOverlay = (sentence:BUI.TemplateResult=BUI.html`Overlay <b>example</b>`) => {
            const overlay = document.getElementById("overlay");
            if (overlay) {
                const label = BUI.Component.create<HTMLDivElement>(() => {
                    return BUI.html`
                    <div style="text-align:center; padding:10px; background:rgba(0,0,0,0.2); border-radius: 10px; margin: 5px">
                        ${sentence}
                    </div>`
                })
                overlay.appendChild(label)
                const timeoutId = window.setTimeout(() => {
                    label.style.display = "none";
                    overlayTimeouts.delete(timeoutId)
                }, 4000); // Nasconde dopo 4 secondi
                overlayTimeouts.add(timeoutId)
            }
        }
        // tutto ciò serve solo per far tornare a bianco il colore della label quando il context menu con le informazioni della risorsa viene chiuso cliccando fuori,
        // altrimenti rimarrebbe evidenziata la riga della tabella anche dopo la chiusura del menu
        const clearContextMenuHighlight = (label: BUI.Label) => {
            label.style.removeProperty('color')
            const registeredHandler = contextMenuOutsideClickHandlers.get(label)
            if (registeredHandler) {
                document.removeEventListener('click', registeredHandler, true)
                contextMenuOutsideClickHandlers.delete(label)
                trackedContextMenuLabels.delete(label)
            }
        }
        const registerContextMenuOutsideClick = (label: BUI.Label) => {
            const previousHandler = contextMenuOutsideClickHandlers.get(label)
            if (previousHandler) {
                document.removeEventListener('click', previousHandler, true)
            }
            const outsideClickHandler: EventListener = (event) => {
                const target = event.target as Node | null
                if (target && label.contains(target)) return
                clearContextMenuHighlight(label)
            }
            contextMenuOutsideClickHandlers.set(label, outsideClickHandler)
            trackedContextMenuLabels.add(label)
            document.addEventListener('click', outsideClickHandler, true)
        }
        const highlightGroupedColors = async (
            groupedColors: Record<string, Record<string, string[]>>,
        ) => {
            const geometryIdsByModel = new Map<string, number[]>(
                await Promise.all(
                    Object.keys(groupedColors).map(async (modelId) => [
                        modelId,
                        await getCachedGeometryIds(modelId),
                    ] as const),
                ),
            )

            for (const [modelId, modelColorGroups] of Object.entries(groupedColors)) {
                onSetTransparency({ [modelId]: new Set(geometryIdsByModel.get(modelId) ?? []) })
                for (const [color, ids] of Object.entries(modelColorGroups)) {
                    highlighter.highlightByID(
                        color,
                        { [modelId]: new Set<number>(ids.map(Number).filter((id) => !Number.isNaN(id))) },
                        false,
                        false,
                    )
                }
            }
        }
        const addResourceGroupSummary = (
            summaryMap: Record<string, ResourceGroupSummary>,
            groupKey: string,
            cost: number,
            currency: string,
            options: Omit<ResourceGroupSummary, 'resourceCost' | 'currency'> = {},
        ) => {
            if (!summaryMap[groupKey]) {
                summaryMap[groupKey] = {
                    resourceCost: 0,
                    currency,
                    ...options,
                }
            }
            summaryMap[groupKey].resourceCost += cost
        }
        const addCostGroupSummary = (
            summaryMap: Record<string, CostGroupSummary>,
            groupKey: string,
            cost: number,
            currency: string,
            options: Omit<CostGroupSummary, 'cost' | 'currency'> = {},
        ) => {
            if (!summaryMap[groupKey]) {
                summaryMap[groupKey] = {
                    cost: 0,
                    currency,
                    ...options,
                }
            }
            summaryMap[groupKey].cost += cost
        }
        const buildElementCostRowsFromCostItems = ({
            modelId,
            costItems,
            itemDataById,
            costValuesById,
        }: {
            modelId: string
            costItems: FRAGS.ItemData[]
            itemDataById: Map<number, FRAGS.ItemData>
            costValuesById: Map<number, FRAGS.ItemData>
        }) => {
            const rows: BUI.TableGroupData<DynamicCostTableData>[] = []
            let hasAssignments = false

            for (const costItem of costItems) {
                const relatedItem = getItemRelationArray(costItem, 'Controls')?.[0]
                const itemId = getLocalId(relatedItem)
                if (typeof itemId !== 'number') continue

                const itemData = itemDataById.get(itemId) ?? relatedItem
                const costValues = getItemRelationArray(costItem, 'CostValues')
                if (!itemData || !costValues || costValues.length === 0) continue

                const itemName = String(getItemAttributeValue(itemData, 'Name') ?? 'nd')
                const itemIfcClass = String(getItemAttributeValue(itemData, '_category') ?? 'nd')
                const costItemName = String(getItemAttributeValue(costItem, 'Name') ?? 'nd')
                const costItemDescription = String(getItemAttributeValue(costItem, 'Description') ?? 'nd')

                hasAssignments = true

                for (const costValueReference of costValues) {
                    const costValueId = getLocalId(costValueReference)
                    const costValue = typeof costValueId === 'number' ? costValuesById.get(costValueId) : undefined
                    if (!costValue) continue

                    const appliedValue = getItemRelationArray(costValue, 'AppliedValue')?.[0]
                    const appliedValueComponent = getItemAttributeValue<number>(appliedValue, 'ValueComponent')
                    if (typeof appliedValueComponent !== 'number') continue

                    const appliedValueUnit = getItemRelationArray(appliedValue, 'UnitComponent')?.[0]
                    const currency = convertCurrency(
                        String(getItemAttributeValue(appliedValueUnit, 'Currency') ?? 'nd'),
                    )

                    const unitBasis = getItemRelationArray(costValue, 'UnitBasis')?.[0]
                    const quantityValue = getItemAttributeValue<number>(unitBasis, 'ValueComponent')
                    const unitBasisComponent = getItemRelationArray(unitBasis, 'UnitComponent')?.[0]
                    const unitMeasure = convertUnits(
                        String(getItemAttributeValue(unitBasisComponent, 'Name') ?? 'nd'),
                    )

                    let costItemUnitCost: number | string = 'nd'
                    let componentsCostValues: unknown = 'nd'
                    const unitCostComponent = getItemRelationArray(costValue, 'Components')?.[0]
                    if (getItemAttributeValue(unitCostComponent, 'Category') === 'Unit cost') {
                        const unitCostAppliedValue = getItemRelationArray(unitCostComponent, 'AppliedValue')?.[0]
                        const unitCostValue = getItemAttributeValue<number>(unitCostAppliedValue, 'ValueComponent')
                        const unitCostUnit = getItemRelationArray(unitCostAppliedValue, 'UnitComponent')?.[0]
                        if (typeof unitCostValue === 'number') {
                            costItemUnitCost = `${Math.round(unitCostValue * 100) / 100} ${convertCurrency(
                                String(getItemAttributeValue(unitCostUnit, 'Currency') ?? 'nd'),
                            )}/${unitMeasure}`
                            componentsCostValues = getItemRelationArray(unitCostComponent, 'Components') ?? 'nd'
                        }
                    }

                    rows.push({
                        data: {
                            ElementName: itemName,
                            ElementIfcClass: itemIfcClass,
                            Cost: `${Math.round(appliedValueComponent * 100) / 100} ${currency}`,
                            Quantity: typeof quantityValue === 'number'
                                ? `${Math.round(quantityValue * 1000) / 1000} ${unitMeasure}`
                                : 'nd',
                            Currency: currency,
                            CostItemName: costItemName,
                            CostItemDescription: costItemDescription,
                            CostItemUnitCost: costItemUnitCost,
                            ComponentsCostValues: componentsCostValues,
                            Model: modelId,
                            ItemId: itemId,
                            ItemVolume: 0,
                            NormalizedCost: 0,
                            NormalizedValue: 0,
                        },
                    })
                }
            }

            return { rows, hasAssignments }
        }
        const renderElementCostPanel = ({
            rows,
            normalization = false,
            colorMap,
            hasAssignments = rows.length > 0,
        }: RenderElementCostPanelOptions) => {
            panelDown.innerHTML = ''
            panelDown.label = 'Element X Costs Panel'

            const dynamicCostTable = document.createElement("bim-table") as BUI.Table<DynamicCostTableData>
            dynamicCostTable.id = 'dynamicCostTable'
            dynamicCostTable.data = [{
                    data: {
                        ElementName: '',
                        ElementIfcClass: '',
                        Cost: '',
                        Quantity: '',
                        Currency: '',
                        CostItemName: '',
                        CostItemDescription: '',
                        CostItemUnitCost: '',
                        ComponentsCostValues: '',
                        ItemVolume: 0,
                        NormalizedCost: 0,
                        NormalizedValue: 0,
                    },
                }]
            dynamicCostTable.data = rows
            dynamicCostTable.preserveStructureOnFilter = true
            dynamicCostTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"

            const totalCostPerGroupedTable: Record<string, CostGroupSummary> = {}
            for (const row of rows) {
                const { ElementIfcClass, ElementName, CostItemName, ItemId, Model } = row.data
                if (!ElementIfcClass || !ElementName || !CostItemName) continue

                const cost = Number(String(row.data.Cost).split(' ')[0])
                if (!Number.isFinite(cost)) continue
                const currency = String(row.data.Cost).split(' ')[1] ?? ''

                addCostGroupSummary(totalCostPerGroupedTable, ElementIfcClass, cost, currency, { model: Model })
                addCostGroupSummary(totalCostPerGroupedTable, ElementName, cost, currency, { model: Model, itemId: ItemId })
                addCostGroupSummary(totalCostPerGroupedTable, CostItemName, cost, currency, {
                    model: Model,
                    costItemUnitCost: row.data.CostItemUnitCost,
                    costItemDescription: row.data.CostItemDescription,
                    ComponentsValue: row.data.ComponentsCostValues,
                })
            }

            const sortbyDirectionTotalCost = BUI.Component.create<BUI.Dropdown>(
                () => BUI.html`
                    <bim-button icon='meteor-icons:arrow-up' style="max-width:fit-content; z-index:100" tooltip-text='Ascending or descending order'
                        @click="${(e:Event) => {
                            if (!e.target) return
                            const button = e.target as BUI.Button
                            button.icon = button.icon=='meteor-icons:arrow-up' ? 'meteor-icons:arrow-down' : 'meteor-icons:arrow-up'
                            const ascending = button.icon=='meteor-icons:arrow-up' ? false : true
                            onSortDynamicTable(dynamicCostTable, sortbyTotalCostDropdown.value[0], ascending,totalCostPerGroupedTable)}}">
                    </bim-button>`,
            )
            sortbyTotalCostDropdown.onchange = (e) => {
                if (!e.target) return
                const field = (e.target as BUI.Dropdown).value[0]
                const ascending = sortbyDirectionTotalCost.icon=='meteor-icons:arrow-up' ? false : true
                onSortDynamicTable(dynamicCostTable, field, ascending, totalCostPerGroupedTable)
            }

            dynamicCostTable.dataTransform = {
                Cost: (value, rowData) => {
                    const { ElementName, ElementIfcClass, CostItemName } = rowData
                    if (!ElementName && !CostItemName && ElementIfcClass) {
                        if (value !== '') return value
                        return `${Math.round((totalCostPerGroupedTable[ElementIfcClass]?.cost ?? 0) * 100) / 100} ${totalCostPerGroupedTable[ElementIfcClass]?.currency ?? ''}`
                    }
                    if (!ElementName && CostItemName && !ElementIfcClass) {
                        if (value !== '') return value
                        return `${Math.round((totalCostPerGroupedTable[CostItemName]?.cost ?? 0) * 100) / 100} ${totalCostPerGroupedTable[CostItemName]?.currency ?? ''}`
                    }
                    if (ElementName && !CostItemName && !ElementIfcClass) {
                        if (value !== '') return value
                        const elementSummary = totalCostPerGroupedTable[ElementName]
                        if (!elementSummary) return value
                        if (colorMap) {
                            return BUI.html`
                                <div style="display: flex; flex-direction:row; gap:1rem; min-width:100%">
                                    <div style="height:1rem; width: 1rem; margin-left: 2rem; border-radius:5px; 
                                        background-color:${colorMap[Number(elementSummary.itemId)]};
                                        color:${colorMap[Number(elementSummary.itemId)]};">.</div>
                                    <bim-label>${Math.round(elementSummary.cost * 100) / 100} ${elementSummary.currency}</bim-label>
                                </div>
                            `
                        }
                        return `${Math.round(elementSummary.cost * 100) / 100} ${elementSummary.currency}`
                    }
                    return value
                },
                CostItemUnitCost: (value, rowData) => {
                    const { ComponentsCostValues, CostItemName, CostItemDescription, CostItemUnitCost } = rowData
                    if (CostItemUnitCost == 'nd' || !CostItemUnitCost) return value
                    return BUI.html`
                    <bim-button
                        label=${value}
                        style="background-color:rgba(0,0,0,0.1)"
                        @click=${() => {
                            onOpenPriceAnalysis(ComponentsCostValues as FRAGS.ItemData[] | string | undefined, CostItemName, CostItemDescription, CostItemUnitCost)
                            }}
                        >
                    </bim-button>
                    `
                },
                ElementName: (value, rowData) => {
                    const { Model, ItemId } = rowData
                    let id = ItemId
                    let modelId = Model
                    if (!ItemId) id = Number(totalCostPerGroupedTable[value]?.itemId)
                    if (!Model) modelId = totalCostPerGroupedTable[value]?.model
                    return BUI.html`
                        <bim-label
                            @click=${async () => {
                                highlighter.highlightByID("select", {[modelId as string]: new Set<number>([id as number])}, false, true)
                                const guid = await fragments.modelIdMapToGuids({[modelId as string]: new Set<number>([id as number])})
                                await navigator.clipboard.writeText(guid[0])
                                }}
                            @mouseover=${({target}:{target:BUI.Label}) => {target.style.color = "rgba(36, 241, 234, 1)"}}
                            @mouseleave=${({target}:{target:BUI.Label}) => {target.style.removeProperty('color')}}
                        >${value}</bim-label>`
                },
                CostItemName: (value, rowData) => {
                    const { ElementIfcClass, ElementName } = rowData
                    if (!ElementName && !ElementIfcClass) {
                        return BUI.html`
                            <bim-label
                                @click=${async () => { 
                                    const summary = totalCostPerGroupedTable[value]
                                    onOpenPriceAnalysis(summary?.ComponentsValue as FRAGS.ItemData[] | string | undefined, value, summary?.costItemDescription, summary?.costItemUnitCost)
                                }}
                                @mouseover=${({target}:{target:BUI.Label}) => {
                                    const contextMenu = target.querySelector<BUI.ContextMenu>('bim-context-menu')
                                    if (!contextMenu) return
                                    contextMenu.visible = true
                                    target.style.color = "rgba(36, 241, 234, 1)"
                                    registerContextMenuOutsideClick(target)
                                }}
                                @mouseleave=${() => {
                                    // target.style.removeProperty('color')
                                }}>
                                ${value}
                                <bim-context-menu id="bim-context-menu-resource" style="max-width: 30rem; padding: 0.75rem;">
                                    <bim-label style="display: block; width:20rem; white-space: normal; overflow-wrap: break-word;">
                                        ${totalCostPerGroupedTable[value]?.costItemUnitCost ? `Unit Cost: ${totalCostPerGroupedTable[value].costItemUnitCost}` : 'No unit cost available'}
                                    </bim-label>
                                    <bim-label style="display: block; width:20rem; white-space: normal; overflow-wrap: break-word;">
                                        ${totalCostPerGroupedTable[value]?.costItemDescription ? `Description: ${totalCostPerGroupedTable[value].costItemDescription}` : 'No description available'}
                                    </bim-label>
                                </bim-context-menu>
                            </bim-label>`
                    }
                    return value
                },
            }

            if (normalization) {
                dynamicCostTable.dataTransform.ItemVolume = (value, rowData) => {
                    if (!rowData.ItemId || typeof rowData.ItemVolume !== 'number' || rowData.ItemVolume <= 0) {
                        return value
                    }
                    return BUI.html`<bim-label>${Math.round(rowData.ItemVolume * 1000) / 1000} m³</bim-label>`
                }
                dynamicCostTable.dataTransform.NormalizedCost = (value, rowData) => {
                    if (
                        !rowData.ItemId ||
                        typeof rowData.NormalizedCost !== 'number' ||
                        typeof rowData.NormalizedValue !== 'number'
                    ) {
                        return value
                    }
                    return BUI.html`
                        <bim-label>${Math.round(rowData.NormalizedCost * 100) / 100} ${rowData.Currency}/m³ (${Math.round(rowData.NormalizedValue * 100) / 100})</bim-label>
                    `
                }
            }

            dynamicCostTable.groupedBy = ['ElementName']
            dynamicCostTable.columns = ['ElementName']
            dynamicCostTable.hiddenColumns = normalization
                ? ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','NormalizedValue']
                : ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','ItemVolume','NormalizedCost','NormalizedValue']

            const elementXCostPanelControls = BUI.Component.create<HTMLDivElement>(() => {
                return BUI.html`
                    <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px 10px 5px 10px'})}>
                        <div style="display: flex; gap: 0.5rem;">
                            <bim-button @click=${(e:Event) => onExpandTable(e,dynamicCostTable)} label=${dynamicCostTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                            <bim-label>Group by:</bim-label>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('groupby_element')!.style.removeProperty('background-color');
                                document.getElementById('groupby_costitem')!.style.removeProperty('background-color');
                                sortbyTotalCostDropdown_optionOne.label = 'ElementIfcClass'
                                sortbyTotalCostDropdown.value = []
                                dynamicCostTable.groupedBy = ['ElementIfcClass','ElementName']
                                dynamicCostTable.columns = ['ElementIfcClass','ElementName']
                                dynamicCostTable.hiddenColumns = normalization
                                    ? ['ComponentsCostValues','Model','ItemId','ElementIfcClass','Currency','ElementName','NormalizedValue']
                                    : ['ComponentsCostValues','Model','ItemId','ElementIfcClass','Currency','ElementName','ItemVolume','NormalizedCost','NormalizedValue']
                            }} id="groupby_ifcclass" label="IFC Class" style="max-width:fit-content"></bim-button>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('groupby_ifcclass')!.style.removeProperty('background-color');
                                document.getElementById('groupby_costitem')!.style.removeProperty('background-color');
                                sortbyTotalCostDropdown_optionOne.label = 'ElementName'
                                sortbyTotalCostDropdown.value = []
                                dynamicCostTable.groupedBy = ['ElementName']
                                dynamicCostTable.columns = ['ElementName']
                                dynamicCostTable.hiddenColumns = normalization
                                    ? ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','NormalizedValue']
                                    : ['ComponentsCostValues','Model','ItemId','ElementName','ElementIfcClass','Currency','ItemVolume','NormalizedCost','NormalizedValue']
                            }} id="groupby_element"  label="Element" style="max-width:fit-content; background-color:var(--background-200)"></bim-button>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('groupby_ifcclass')!.style.removeProperty('background-color');
                                document.getElementById('groupby_element')!.style.removeProperty('background-color');
                                sortbyTotalCostDropdown_optionOne.label = 'CostItemName'
                                sortbyTotalCostDropdown.value = []
                                dynamicCostTable.groupedBy = ['CostItemName']
                                dynamicCostTable.columns = ['CostItemName']
                                dynamicCostTable.hiddenColumns = normalization
                                    ? ['ComponentsCostValues','Model','ItemId','CostItemDescription','CostItemUnitCost','CostItemName','Currency','NormalizedValue']
                                    : ['ComponentsCostValues','Model','ItemId','CostItemDescription','CostItemUnitCost','CostItemName','Currency','ItemVolume','NormalizedCost','NormalizedValue']
                            }} id="groupby_costitem"  label="Cost Item" style="max-width:fit-content"></bim-button>
                            <bim-label>Sort by:</bim-label>
                            ${sortbyTotalCostDropdown}
                            ${sortbyDirectionTotalCost}
                            <bim-label>Ghost mode:</bim-label>
                            <bim-button 
                                id='ghost-mode' 
                                @click=${async (e:Event) => {
                                    await onSetTransparencyToCostColor(e);
                                    const button = e.target as BUI.Button
                                    button.label = button.label=='Ghost' ? 'Reset' : 'Ghost'
                                }} 
                                label="Ghost"
                                tooltip-text="Set transparency to non-selected items. On the side, you can set their opacity. Ghost mode works only on cost analysis colored items."
                                style="max-width:fit-content; z-index:100">
                            </bim-button>
                            <bim-number-input
                                id='ghost-mode-opacity' slider step="0.01" value="0.5" min="0" max="1"
                                style="max-width:fit-content; z-index:100"
                                @change="${async ({ target }: { target: BUI.NumberInput }) => {
                                    await updateCostTransparentOpacity(target.value)
                                }}">
                            </bim-number-input>
                            <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,dynamicCostTable)}}></bim-text-input>
                            <bim-button @click=${() => {onClearPanel(panelDown),onClearPanel(panelRight)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                            <bim-button tooltip-text="Click on item's name to add it to the selection" icon='majesticons:lightbulb-shine' style="max-width:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                        </div>
                    </div>
                `
            })
            const elementXCostPanel = BUI.Component.create<BUI.Panel>(() => {
                return BUI.html`
                <bim-panel style="display:flex; flex-direction:column; gap:10px; margin:5px 15px 5px 15px; background-color:transparent; flex:1;">
                    ${dynamicCostTable}
                </bim-panel>`
            })

            if (hasAssignments) {
                panelDown.appendChild(elementXCostPanelControls)
                panelDown.appendChild(elementXCostPanel)
            } else {
                panelDown.appendChild(noCostItemsLabel)
            }

            const gridLayout = floatingGrid.layout as any
            if (!gridLayout.includes('down')){
                onSetLayout({target:'down'})
            }
        }
        // #endregion

        // #endregion

        // #region UI PANELS   
        const panelLeft = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="BIM PANEL"
                class="blur-background-container">
            </bim-panel>
            `;
        })
        const panelRight = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="Right Panel"
                class="blur-background-container">
            </bim-panel>
            `;
        })
        const panelDown = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
            <bim-panel
                label="Down Panel"
                class="blur-background-container">
            </bim-panel>
            `;
        })
        const panelWorldSettings = BUI.Component.create<BUI.Panel>(() => {
            return BUI.html`
                <bim-panel
                    label="Scene Visibility Settings"
                    class="blur-background-container">
                    <bim-panel-section label='Preset Styles'>
                        <bim-button label='Basic'
                            @click="${async () => {
                                const transparencyOpacity = document.getElementById('transparency-opacity') as BUI.NumberInput
                                const transparencyColor = document.getElementById('transparency-color') as BUI.ColorInput
                                const gridVisible = document.getElementById('grid-visible') as BUI.Checkbox
                                const gridColor = document.getElementById('grid-color') as BUI.ColorInput
                                const gridPrimarySize = document.getElementById('grid-primary-size') as BUI.NumberInput
                                const gridSecondarySize = document.getElementById('grid-secondary-size') as BUI.NumberInput
                                const ambientBackgroundColor = document.getElementById('ambient-background-color') as BUI.ColorInput
                                const ambientDirectionalLightsIntensity = document.getElementById('ambient-directional-lights-intensity') as BUI.NumberInput
                                const ambientAmbientLightsIntensity = document.getElementById('ambient-ambient-lights-intensity') as BUI.NumberInput
                                const postproductionEnable = document.getElementById('postproduction-enable') as BUI.Checkbox
                                const postproductionStyle = document.getElementById('postproduction-style') as BUI.Dropdown
                                const postproductionAmbientOcclusionIntensity = document.getElementById('postproduction-ambient-occlusion-intensity') as BUI.NumberInput

                                highlighter.styles.get('transparent')!.opacity = transparencyOpacity.value = 0.5
                                transparencyColor.color = "#7b7b7b"
                                highlighter.styles.get('transparent')!.color = new THREE.Color("#7b7b7b")
                                await highlighter.updateColors()

                                grid.visible = gridVisible.checked = true
                                gridColor.color = "#c1c1c1"
                                grid.config.color = new THREE.Color("#c1c1c1")
                                grid.config.primarySize = gridPrimarySize.value = 1
                                grid.config.secondarySize = gridSecondarySize.value = 10

                                ambientBackgroundColor.color = "#3b3c4f"
                                world.scene.config.backgroundColor = new THREE.Color("#3b3c4f")
                                world.scene.config.directionalLight.intensity = ambientDirectionalLightsIntensity.value = 1.5
                                world.scene.config.ambientLight.intensity = ambientAmbientLightsIntensity.value = 1

                                world.renderer!.postproduction.enabled = postproductionEnable.checked = false
                                postproductionStyle.value = ['Basic']
                                world.renderer!.postproduction.style = OBCF.PostproductionAspect.COLOR
                                
                                postproductionAmbientOcclusionIntensity.value = 0.5
                                setAmbientOcclusionParameters(0.5)
                            }}"
                        ></bim-button>
                        <bim-button label='Ambient Occlusion with Transparency'
                            @click="${async () => {
                                const transparencyOpacity = document.getElementById('transparency-opacity') as BUI.NumberInput
                                const transparencyColor = document.getElementById('transparency-color') as BUI.ColorInput
                                const gridVisible = document.getElementById('grid-visible') as BUI.Checkbox
                                const ambientDirectionalLightsIntensity = document.getElementById('ambient-directional-lights-intensity') as BUI.NumberInput
                                const ambientAmbientLightsIntensity = document.getElementById('ambient-ambient-lights-intensity') as BUI.NumberInput
                                const postproductionEnable = document.getElementById('postproduction-enable') as BUI.Checkbox
                                const postproductionStyle = document.getElementById('postproduction-style') as BUI.Dropdown
                                const postproductionAmbientOcclusionIntensity = document.getElementById('postproduction-ambient-occlusion-intensity') as BUI.NumberInput

                                highlighter.styles.get('transparent')!.opacity = transparencyOpacity.value = 0.06
                                transparencyColor.color = "#d6d6d6"
                                highlighter.styles.get('transparent')!.color = new THREE.Color("#d6d6d6")
                                await highlighter.updateColors()

                                grid.visible = gridVisible.checked = false

                                world.scene.config.directionalLight.intensity = ambientDirectionalLightsIntensity.value = 3.3
                                world.scene.config.ambientLight.intensity = ambientAmbientLightsIntensity.value = 1.1

                                world.renderer!.postproduction.enabled = postproductionEnable.checked = true
                                postproductionStyle.value = ['Color Shadows']
                                world.renderer!.postproduction.style = OBCF.PostproductionAspect.COLOR_SHADOWS
                                
                                postproductionAmbientOcclusionIntensity.value = 0.67
                                setAmbientOcclusionParameters(0.67)
                            }}"
                        ></bim-button>
                    </bim-panel-section>
                    <bim-panel-section label='Transparency'>
                        <bim-number-input 
                            id='transparency-opacity' slider step="0.01" label="Opacity" value="0.5" min="0" max="1"
                            @change="${async ({ target }: { target: BUI.NumberInput }) => {
                                const transparentStyle = highlighter.styles.get('transparent') as { opacity?: number } | undefined
                                if (transparentStyle) {
                                    transparentStyle.opacity = target.value
                                }
                                await highlighter.updateColors()
                            }}">
                        </bim-number-input>
                        <bim-color-input
                            id="transparency-color" label="Color" color="#7b7b7b" 
                            @input="${async ({ target }: { target: BUI.ColorInput }) => {
                                const transparentStyle = highlighter.styles.get('transparent') as { color?: THREE.Color } | undefined
                                if (transparentStyle) {
                                    transparentStyle.color = new THREE.Color(target.color)
                                }
                                await highlighter.updateColors()
                            }}">
                        </bim-color-input>
                    </bim-panel-section>
                    <bim-panel-section label='Grid'>
                        <bim-checkbox
                            id="grid-visible" checked label="Visible"
                            @change="${({ target }: { target: BUI.Checkbox }) => {
                                grid.visible = target.value
                            }}">
                        </bim-checkbox>
                        <bim-color-input
                            id="grid-color" label="Color" color="#c1c1c1"
                            @input="${({ target }: { target: BUI.ColorInput }) => {
                                grid.config.color = new THREE.Color(target.color);
                            }}">
                        </bim-color-input>
                        <bim-number-input 
                            id="grid-primary-size" slider step="0.5" label="Primary size" value="1" min="0.5" max="10" style='min-width:100px'
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                grid.config.primarySize = target.value
                            }}">
                        </bim-number-input>
                        <bim-number-input 
                            id="grid-secondary-size" slider step="1" label="Secondary size" value="10" min="1" max="50"
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                grid.config.secondarySize = target.value
                            }}">
                        </bim-number-input>
                    </bim-panel-section>
                    <bim-panel-section label='Ambient'>
                        <bim-color-input
                            id="ambient-background-color" label="Background Color" color="#3b3c4f" 
                            @input="${({ target }: { target: BUI.ColorInput }) => {
                                world.scene.config.backgroundColor = new THREE.Color(target.color)
                            }}">
                        </bim-color-input>
                        <bim-number-input 
                            id="ambient-directional-lights-intensity" slider step="0.1" label="Directional lights intensity" value="1.5" min="0.1" max="10"
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                world.scene.config.directionalLight.intensity = target.value;
                            }}">
                        </bim-number-input>
                        <bim-number-input 
                            id="ambient-ambient-lights-intensity" slider step="0.1" label="Ambient light intensity" value="1" min="0.1" max="5"
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                world.scene.config.ambientLight.intensity = target.value;
                            }}">
                        </bim-number-input>
                    </bim-panel-section>
                    <bim-panel-section label='Postproduction'>
                        <bim-checkbox label="Enable"
                            id="postproduction-enable" @change="${({ target }: { target: BUI.Checkbox }) => {
                                world.renderer!.postproduction.enabled = target.value
                            }}">
                        </bim-checkbox>
                        <bim-dropdown id="postproduction-style" required label="Style"
                                @change="${({ target }: { target: BUI.Dropdown }) => {
                                const result = target.value[0] as OBCF.PostproductionAspect;
                                world.renderer!.postproduction.style = result;
                            }}">
                            <bim-option id="postproduction-style-basic" style="padding:0 0.5rem 0 0.5rem" checked label="Basic" value="${OBCF.PostproductionAspect.COLOR}"></bim-option>
                            <bim-option id="postproduction-style-pen" style="padding:0 0.5rem 0 0.5rem" label="Pen" value="${OBCF.PostproductionAspect.PEN}"></bim-option>
                            <bim-option id="postproduction-style-shadowed-pen" style="padding:0 0.5rem 0 0.5rem" label="Shadowed Pen" value="${OBCF.PostproductionAspect.PEN_SHADOWS}"></bim-option>
                            <bim-option id="postproduction-style-color-pen" style="padding:0 0.5rem 0 0.5rem" label="Color Pen" value="${OBCF.PostproductionAspect.COLOR_PEN}"></bim-option>
                            <bim-option id="postproduction-style-color-shadows" style="padding:0 0.5rem 0 0.5rem" label="Color Shadows" value="${OBCF.PostproductionAspect.COLOR_SHADOWS}"></bim-option>
                            <bim-option id="postproduction-style-color-pen-shadows" style="padding:0 0.5rem 0 0.5rem" label="Color Pen Shadows" value="${OBCF.PostproductionAspect.COLOR_PEN_SHADOWS}"></bim-option>
                        </bim-dropdown>
                        <bim-number-input
                            id="postproduction-ambient-occlusion-intensity" slider step="0.01" label="Ambient occlusion intensity"
                            value="0.5" min="0.1" max="1"
                            @change="${({ target }: { target: BUI.NumberInput }) => {
                                setAmbientOcclusionParameters(target.value)
                        }}">
                        </bim-number-input>
                    </bim-panel-section>
                </bim-panel>
            `
        })
        // #endregion

        // #region ADVANCED COMPONENTS
        fragments.list.onItemDeleted.add(() => {
            clearAnalysisCaches()
            onClearPanel(panelDown) //clear down panel
            onClearPanel(panelRight)
            updateCountLabel({countItems:0, countCostItems:0, countResources:0})
        })
        const loadingLabel = BUI.Component.create<BUI.Label>(()=>{
            return BUI.html`
                <bim-label style='padding:20px'>Loading...</bim-label>
            `
        })
        interface countLabelUI {
            countItems: number | 'loading...',
            countCostItems: number | 'loading...',
            countResources: number | 'loading...',
        }
        const [countLabel, updateCountLabel] = BUI.Component.create<HTMLDivElement, countLabelUI>((state: countLabelUI) => {
            const { countItems, countResources, countCostItems } = state
            const resDisplay: string = (countResources==0||countResources=='loading...') ? 'none' : ''
            const colorRangeDisplay : string = (Number(countItems)<100||countItems=='loading...') ? 'none' : ''
            return BUI.html`
                <div style="margin-top:5px; border-top:1px solid var(--bim-ui_bg-contrast-20); padding-top:0.5rem">
                    <bim-label>Elements count: ${countItems}</bim-label>
                    <bim-label>Cost Items count: ${countCostItems}</bim-label>
                    <bim-label style="display:${resDisplay}">Resources count: ${countResources}</bim-label>
                    <bim-label style="display:${colorRangeDisplay}; margin-top: 10px" icon="ion:warning-outline">More than 100 elements: geometries colors remapped in five ranges.</bim-label>
                </div>
            `;
            },
            { countItems: 0, countResources: 0, countCostItems: 0},
        );
        const noCostItemsLabel = BUI.Component.create<BUI.Label>(() => {
            return BUI.html`
                <bim-label style="padding:15px">Any COST ITEM related to selected elements!</bim-label>
            `;
            }
        );
        const modelsListPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            const [modelsList] = BUIC.tables.modelsList({
                components,
                metaDataTags: ["schema"],
                actions: { download: false },
            });
            return BUI.html`
                <bim-panel-section label="Loaded Models" icon="material-symbols:upload-rounded">
                    ${modelsList}
                </bim-panel-section>
            `
        })
        const spatialTreePanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            const [spatialTree] = BUIC.tables.spatialTree({
                components,
                models: []
            });
            spatialTree.preserveStructureOnFilter = true
            return BUI.html`
                <bim-panel-section label='Spatial Structure' icon="ri:node-tree">
                    <bim-text-input @input=${(e:Event)=>{onSearch(e,spatialTree)}} placeholder="Search..." debounce="200"></bim-text-input>
                    ${spatialTree}
                </bim-panel-section>
            `
        })
        const [selectedItemsCount, updateSelectedItemsCount] = BUI.Component.create<BUI.Label,{count:number}>((state:{count:number}) => {
            let loadStatement: string = ''
            if (state.count < 6){
                loadStatement = ''
            } else {
                loadStatement = '→ Click the Load button to show properties'
            }
            return BUI.html`
                <bim-label>Selected items count: ${state.count} ${loadStatement}</bim-label>
            `},
            { count: 0 },
        )
        
        type dynamicPropertiesTableData = {
            itemName: string,
            itemId: number,
            modelId: string,
            propertySetName?: string,
            propertyType?: string,
            propertyName?: string,
            propertyValue?: string,
        }
        //tables
        const dynamicPropertiesTable = document.createElement("bim-table") as BUI.Table<dynamicPropertiesTableData>
        dynamicPropertiesTable.id = 'dynamicPropertiesTable'
        dynamicPropertiesTable.data = [{
                data: {
                    itemName: '',
                    itemId: 0,
                    modelId: '',
                    propertySetName: '',
                    propertyType: '',
                    propertyName: '',
                    propertyValue: ''

                }}]
        dynamicPropertiesTable.data = []
        dynamicPropertiesTable.preserveStructureOnFilter = true
        dynamicPropertiesTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
        dynamicPropertiesTable.headersHidden = true
        const convertDataName: {[key:string]:string} = {
            '_category': 'IFC Class',
            '_guid': 'GlobalId',
            '_localId': 'StepId',
        }
        let loadingLabelProps: BUI.Label
        const onLoadAttributesTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relationsDefault: { attributes: false, relations: false }}) //questi sono gli attributi
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (Array.isArray(itemDataEntry)) continue
                        const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                            data: {},
                        }
                        rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                        rowData.data.itemId = itemId
                        rowData.data.modelId = modelId
                        rowData.data.propertyName = convertDataName[itemDataEntryName] ? convertDataName[itemDataEntryName] : itemDataEntryName
                        rowData.data.propertySetName = 'Attributes'
                        rowData.data.propertyType = 'Attribute'
                        const value = itemDataEntryName=='_localId' ?
                            '#'+itemDataEntry.value :
                            Number(itemDataEntry.value) ?
                                Math.round(Number(itemDataEntry.value)*100)/100 :
                                itemDataEntry.value
                        rowData.data.propertyValue = value
                        if (!rowData.data.propertyName) continue
                        dynamicPropertiesTable.data.push(rowData)
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }
        const onLoadRelationsTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relationsDefault: { attributes: true, relations: false }}) //questi sono gli attributi
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (['IsDefinedBy'].includes(itemDataEntryName)) continue
                        if (!Array.isArray(itemDataEntry)) continue
                        for (const [,relItemData] of Object.entries(itemDataEntry)){
                            const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                data: {},
                            }
                            rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                            rowData.data.itemId = itemId
                            rowData.data.modelId = modelId
                            rowData.data.propertyType = 'Relation'
                            rowData.data.propertySetName = itemDataEntryName
                            rowData.data.propertyName = (relItemData._category as FRAGS.ItemAttribute).value
                            rowData.data.propertyValue = relItemData.Name ? (relItemData.Name as FRAGS.ItemAttribute).value : ''
                            if (!rowData.data.propertyName) continue
                            dynamicPropertiesTable.data.push(rowData)
                        }
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName','propertySetName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }
        const onLoadMaterialsTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relations: {'HasAssociations': { attributes: true, relations: false }}}) //mettendo false su relations è molto più veloce ma poi bisogna riusare getData per ottenere quelle relations
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (!Array.isArray(itemDataEntry)) continue
                        for (const [,relItemData] of Object.entries(itemDataEntry)){
                            if ((relItemData._category as FRAGS.ItemAttribute).value == 'IFCMATERIALLAYERSETUSAGE'){
                                const localId = (relItemData._localId as FRAGS.ItemAttribute).value as number
                                const associations = await fragments.getData({[modelId]:new Set<number>([localId])}, {attributesDefault:true, relations: {'ForLayerSet': { attributes: true, relations: true }}})
                                const materialsLayers = (associations[modelId][0].ForLayerSet as FRAGS.ItemData[])[0].MaterialLayers as FRAGS.ItemData[]
                                for (const layer of materialsLayers) {
                                    const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                        data: {},
                                    }
                                    const materialId = (layer._localId as FRAGS.ItemAttribute).value
                                    const material = await fragments.getData({[modelId]:new Set<number>([materialId])}, {attributesDefault:true, relationsDefault: { attributes: true, relations: true }})
                                    const materialName = (((material[modelId] as FRAGS.ItemData[])[0].Material as FRAGS.ItemData[])[0].Name as FRAGS.ItemAttribute).value
                                    const layerThickness = (layer.LayerThickness as FRAGS.ItemAttribute).value
                                    rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                    rowData.data.itemId = itemId
                                    rowData.data.modelId = modelId
                                    rowData.data.propertyType = 'Relation'
                                    rowData.data.propertySetName = itemDataEntryName
                                    rowData.data.propertyName = materialName
                                    rowData.data.propertyValue = layerThickness
                                    if (!rowData.data.propertyName) continue
                                    dynamicPropertiesTable.data.push(rowData)
                                }
                            } else if ((relItemData._category as FRAGS.ItemAttribute).value == 'IFCMATERIALLIST'){
                                const localId = (relItemData._localId as FRAGS.ItemAttribute).value as number
                                const associations = await fragments.getData({[modelId]:new Set<number>([localId])}, {attributesDefault:true,relationsDefault:{ attributes: true, relations: false }})
                                for (const material of ((associations[modelId] as FRAGS.ItemData[])[0].Materials as FRAGS.ItemData[])){
                                    const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                        data: {},
                                    }
                                    const materialName = (material.Name as FRAGS.ItemAttribute).value
                                    rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                    rowData.data.itemId = itemId
                                    rowData.data.modelId = modelId
                                    rowData.data.propertyType = 'Relation'
                                    rowData.data.propertySetName = itemDataEntryName
                                    rowData.data.propertyName = materialName
                                    rowData.data.propertyValue = ''
                                    if (!rowData.data.propertyName) continue
                                    dynamicPropertiesTable.data.push(rowData)                                    
                                }
                            }
                        }
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }
        const onLoadPropertiesTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relations: {'IsDefinedBy': {attributes: true, relations: true}}})
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (itemDataEntryName != 'IsDefinedBy') continue
                        if (!Array.isArray(itemDataEntry)) continue
                        for (const [,relItemData] of Object.entries(itemDataEntry)){
                            if (!relItemData.HasProperties) continue
                            for (const [, relPropertyData] of Object.entries(relItemData.HasProperties)){
                                const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                    data: {},
                                }
                                rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                rowData.data.itemId = itemId
                                rowData.data.modelId = modelId
                                rowData.data.propertyType = 'Relation'
                                rowData.data.propertySetName = (relItemData.Name as FRAGS.ItemAttribute).value
                                rowData.data.propertyName = (relPropertyData.Name as FRAGS.ItemAttribute).value
                                rowData.data.propertyValue = (relPropertyData.NominalValue as FRAGS.ItemAttribute).value
                                if (!rowData.data.propertyName) continue
                                dynamicPropertiesTable.data.push(rowData)
                            }
                        }
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName','propertySetName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }
        const onLoadQuantitiesTable = async () => {
            loadingLabelProps.style.display = ''
            dynamicPropertiesTable.data = []
            const selection = highlighter.selection.select
            const itemsData = await fragments.getData(selection, {attributesDefault: true, relations: {'IsDefinedBy': {attributes: true, relations: true}}}) //questi sono gli attributi
            const IfcPhisicalSimpleQuantities = ['AreaValue','CountValue','LengthValue','NumberValue','TimeValue','VolumeValue','WeightValue']
            for (const [modelId, itemIdSet] of Object.entries(selection)){
                for (const itemId of itemIdSet){
                    const itemData = itemsData[modelId]?.find((item: FRAGS.ItemData) => (item._localId as FRAGS.ItemAttribute).value == itemId)
                    if (!itemData) continue
                    for (const [itemDataEntryName,itemDataEntry] of Object.entries(itemData)){
                        if (itemDataEntryName != 'IsDefinedBy') continue
                        if (!Array.isArray(itemDataEntry)) continue
                        for (const [,relItemData] of Object.entries(itemDataEntry)){
                            if ((relItemData.Name as FRAGS.ItemAttribute).value != 'BaseQuantities') continue
                            for (const [, relPropertyData] of Object.entries(relItemData.Quantities)){
                                const rowData: BUI.TableGroupData<dynamicPropertiesTableData> = {
                                    data: {},
                                }
                                rowData.data.itemName = (itemData['Name'] as FRAGS.ItemAttribute)?.value || ''
                                rowData.data.itemId = itemId
                                rowData.data.modelId = modelId
                                rowData.data.propertyType = 'Relation'
                                rowData.data.propertySetName = (relItemData.Name as FRAGS.ItemAttribute).value
                                rowData.data.propertyName = (relPropertyData.Name as FRAGS.ItemAttribute).value
                                for (const phisicalQuantity of IfcPhisicalSimpleQuantities){
                                    if (!relPropertyData[phisicalQuantity]) continue
                                    const unit = relPropertyData.Unit ? (relPropertyData.Unit as FRAGS.ItemAttribute).value : null
                                    const value = (relPropertyData[phisicalQuantity] as FRAGS.ItemAttribute).value
                                    rowData.data.propertyValue = unit ? value + ' ' + unit : value
                                }
                                if (!rowData.data.propertyName) continue
                                dynamicPropertiesTable.data.push(rowData)
                            }
                        }
                    }
                }
            }
            dynamicPropertiesTable.groupedBy = ['itemName']
            dynamicPropertiesTable.hiddenColumns = ['itemId','itemName','modelId','propertySetName','propertyType']
            loadingLabelProps.style.display = 'none'
        }

        const propertiesPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            // const [propertiesTable, updatePropertiesTable] = BUIC.tables.itemsData({
            //     components,
            //     modelIdMap: {},
            // });
            // propertiesTable.preserveStructureOnFilter = true;
            // propertiesTable.indentationInText = false;
            highlighter.events.select.onHighlight.add((modelIdMap) => {
                const count = Object.values(modelIdMap).reduce((sum, currentSet) => sum + currentSet.size, 0)
                updateSelectedItemsCount({ count })
                if (count < 6){
                    //updatePropertiesTable({ modelIdMap })
                    const currentLayout = floatingGrid.layout as any
                    if (!currentLayout) return
                    !currentLayout.includes('left') ? onSetLayout({ target: 'left' }) : null
                    onLoadAttributesTable()
                    onSetGroupingBtnColor(btn_Attributes)
                } else {
                    //updatePropertiesTable({ modelIdMap: {} })
                    dynamicPropertiesTable.data = []
                }
            });
            highlighter.events.select.onClear.add(() => {
                //updatePropertiesTable({ modelIdMap: {} })
                updateSelectedItemsCount({ count:0 })
                dynamicPropertiesTable.data = []
            });
            fragments.list.onItemDeleted.add(() => {
                //updatePropertiesTable({ modelIdMap: {} })
                updateSelectedItemsCount({ count:0 })
                dynamicPropertiesTable.data = []
            })
            const onSetGroupingBtnColor = (clickedBtn: BUI.Button) => {
                btn_Attributes.style.backgroundColor = ''
                btn_Properties.style.backgroundColor = ''
                btn_Quantities.style.backgroundColor = ''
                btn_Materials.style.backgroundColor = ''
                btn_Relations.style.backgroundColor = ''
                clickedBtn.style.backgroundColor = 'var(--background-200)'
            }
            let btn_Attributes: BUI.Button
            let btn_Properties: BUI.Button
            let btn_Quantities: BUI.Button
            let btn_Materials: BUI.Button
            let btn_Relations: BUI.Button
            return BUI.html`
                <bim-panel-section id='bim-panel-section-properties' label='Properties' icon="hugeicons:property-new">
                    ${selectedItemsCount}
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <bim-button @click=${(e:Event) => {onLoadAttributesTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Attributes = el as BUI.Button})} id="groupingPropsBtn-Attributes" label="Attributes" icon="material-symbols:user-attributes-rounded" style="flex:1"></bim-button>
                        <bim-button @click=${(e:Event) => {onLoadPropertiesTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Properties = el as BUI.Button})} id="groupingPropsBtn-Properties" label="Properties" icon="ic:round-list" style="flex:1"></bim-button>
                        <bim-button @click=${(e:Event) => {onLoadQuantitiesTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Quantities = el as BUI.Button})} id="groupingPropsBtn-Quantities" label="Quantities" icon="tabler:ruler-measure" style="flex:1"></bim-button>
                        <bim-button @click=${(e:Event) => {onLoadMaterialsTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Materials = el as BUI.Button})} id="groupingPropsBtn-Materials" label="Materials" icon="game-icons:materials-science" tooltip-text="Only IFCMATERIALLAYERSETUSAGE and IFCMATERIALLIST" style="flex:1"></bim-button>
                        <bim-button @click=${(e:Event) => {onLoadRelationsTable(),onSetGroupingBtnColor(e.target as BUI.Button)}} ${BUI.ref((el) => {btn_Relations = el as BUI.Button})} id="groupingPropsBtn-Relations" label="Relations" icon="flowbite:link-outline" style="flex:1"></bim-button>
                    </div>
                    <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                        <bim-button @click=${(e:Event) => onExpandTable(e,dynamicPropertiesTable)} label=${dynamicPropertiesTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                        <bim-button @click=${async () => {
                            const guid = await fragments.modelIdMapToGuids(highlighter.selection.select)
                            if (guid.length==1){
                                await navigator.clipboard.writeText(guid[0])
                            } else {
                                await navigator.clipboard.writeText(guid.join(','))
                            }
                        }} label="Guids" tooltip-text="Copy IfcGuids to clipboard. Multiple Guids are separated by a comma." style="max-width:fit-content; z-index:1000"></bim-button>
                        <bim-text-input @input=${(e:Event)=>{onSearch(e,dynamicPropertiesTable)}} placeholder="Search..." debounce="200"></bim-text-input>
                    </div>
                    <bim-label ${BUI.ref((el) => {loadingLabelProps = el as BUI.Label})} style="display:none; padding:20px">Loading...</bim-label>
                    ${dynamicPropertiesTable}
                </bim-panel-section>
            `
        })
        const selectElementByGuidPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            function parseCommaSeparatedString(input: string): string[] {
                // Rimuove eventuali spazi prima/dopo ogni elemento
                const trimmed = input.trim();
                // Verifica se ci sono virgole nella stringa
                if (trimmed.includes(',')) {
                    // Divide in base alla virgola ed elimina spazi extra da ogni elemento
                    return trimmed.split(',').map(item => item.trim());
                } else {
                    // Nessuna virgola: restituisce un array con la stringa intera
                    return [trimmed];
                }
            }
            const onSelectElementByGuid = async () => {
                const target = document.getElementById('search-by-guid') as BUI.TextInput
                const guids = parseCommaSeparatedString(target.value)
                const frMap = await fragments.guidsToModelIdMap(guids)
                console.log(frMap)
                highlighter.highlightByID("select", frMap, true, true)
            }
            return BUI.html`
            <bim-panel-section
                label="Select elements by IfcGuid",
                icon="material-symbols:highlight-mouse-cursor-rounded"
                >
                <bim-label>
                    Separate GUIDs with a comma ( , ) to select multiple elements
                </bim-label>
                <div style="display:flex; flex-direction:row; gap:0.5rem">
                    <bim-text-input
                        id="search-by-guid",
                        placeholder="Type elements IfcGuid..."
                    >
                    </bim-text-input>
                    <bim-button
                        label="Select",
                        @click=${onSelectElementByGuid}
                        style="max-width:fit-content"
                    >
                    </bim-button>
                </div>
            </bim-panel-section>`;
        })

        // #region DROPDOWN MENUS
        //color scale dropdown
        const colorScaleDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="colorScale" label='Color Scale' icon='ic:outline-color-lens' style="min-width:100px">
                <bim-option label='Green-Yellow-Red' value='gnylrd' style="color:black; padding:0 10px 0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(26, 150, 65, 1),rgba(166, 217, 106, 1),rgba(255, 255, 0, 1),rgba(253, 174, 97, 1),rgba(215, 25, 28, 1))"></bim-option>
                <bim-option label='Yellow-Green-Blue' value='ylgnbu' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(255, 255, 204, 1), rgba(194, 230, 153, 1), rgba(120, 198, 121, 1), rgba(49, 163, 84, 1), rgba(0, 104, 55, 1))"></bim-option>
                <bim-option label='Orange-Red' value='orrd' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(254, 240, 217, 1), rgba(253, 212, 158, 1), rgba(253, 187, 132, 1), rgba(253, 141, 60, 1), rgba(217, 72, 1, 1))"></bim-option>
                <bim-option label='Blues' value='blues' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(239, 243, 255, 1), rgba(189, 215, 231, 1), rgba(107, 174, 214, 1), rgba(33, 113, 181, 1), rgba(8, 69, 148, 1))"></bim-option>
                <bim-option label='Viridis' value='viridis' style="padding:0 10px 0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(68, 1, 84, 1),rgba(59, 82, 139, 1),rgba(33, 144, 141, 1),rgba(94, 201, 98, 1),rgba(253, 231, 37, 1))"></bim-option>
                <bim-option label='Cividis' value='cividis' style="padding:0 10px; margin:0.25rem; background:linear-gradient(to right, rgba(0, 32, 76, 1), rgba(55, 64, 129, 1), rgba(94, 109, 171, 1), rgba(145, 158, 203, 1), rgba(253, 231, 37, 1))"></bim-option>
            </bim-dropdown>`,
        )
        //sort by resources dropdown menu
        const sortbyResourceDropdown_optionOne = BUI.Component.create<BUI.Option>(
            () => BUI.html`<bim-option label='ElementName' style="padding:0 10px 0 10px" icon='qlementine-icons:rename-16'></bim-option>`
        )
        const sortbyResourceDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="sortbyResources" style="max-width:fit-content">
                ${sortbyResourceDropdown_optionOne}
                <bim-option id="sortbyResourceCostDropdown-cost" label='Cost' style="padding:0 10px 0 10px" icon='solar:dollar-linear'></bim-option>
            </bim-dropdown>`,
        )
        //sort by total cost dropdown menu
        const sortbyTotalCostDropdown_optionOne = BUI.Component.create<BUI.Option>(
            () => BUI.html`<bim-option label='ElementName' style="padding:0 10px 0 10px" icon='qlementine-icons:rename-16'></bim-option>`
        )
        const sortbyTotalCostDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`
            <bim-dropdown name="sortbyTotalCost" style="max-width:fit-content">
                ${sortbyTotalCostDropdown_optionOne}
                <bim-option id="sortbyTotalCostDropdown-cost" label='Cost' style="padding:0 10px 0 10px" icon='solar:dollar-linear'></bim-option>
            </bim-dropdown>`,
        )
        //resources dropdown menu
        const resources: string[] = ['TotalCost','Labor','Equipment','Material']
        resources.sort() //sort resources
        const resourcesIcon: {[key:string]:string} = {
            TotalCost: 'ic:round-monetization-on',
            Labor: 'hugeicons:labor',
            Equipment: 'fa-solid:tools',
            Material: 'game-icons:brick-pile',
        }
        const resourcesDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="resources" label='Resource' icon='clarity:resource-pool-outline-alerted'>
                ${resources.map(
                    (x) => BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px" icon=${resourcesIcon[x]}></bim-option>`
                )}
            </bim-dropdown>`,
        );
        //categories dropdown menu
        //capire come aggiungere tutte le categorie
        //const categories = await model.getCategories();
        interface categoriesUI {
            listCategories: string[]
        }
        const [categoriesDropdown, updateCategoriesDropdown] = BUI.Component.create<BUI.Dropdown, categoriesUI>((state: categoriesUI) => {
            const { listCategories } = state
            return BUI.html`<bim-dropdown name="categories" label='IFC Class' icon='material-symbols:category-rounded' multiple>
                ${listCategories.map((x) => {
                    if (x == 'ALL CLASSES') {
                        return BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px; border-bottom: 2px solid black"></bim-option>`
                    } else {
                        return BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px"></bim-option>`
                    }
                }
                )}
            </bim-dropdown>`},
            { listCategories: importedCategories}
        )
        //measure units dropdown menu
        const unitMeasure = ['None','Volume']
        const unitMeasureDropdown = BUI.Component.create<BUI.Dropdown>(
            () => BUI.html`<bim-dropdown name="unitMeasure" label='Normalize Cost By' icon='gravity-ui:chart-area-stacked-normalized'>
                ${unitMeasure.map(
                    (x) => BUI.html`<bim-option label=${x} style="padding:0 10px 0 10px"></bim-option>`,
                )}
            </bim-dropdown>`,
        )
        unitMeasureDropdown.style.display = 'none'
        resourcesDropdown.onchange = (event) => {
            if (!event.target) return
            const dropdown = event.target as BUI.Dropdown
            if (dropdown.value[0] == 'TotalCost'){
                unitMeasureDropdown.style.display = ''
            } else {
                unitMeasureDropdown.style.display = 'none'
            }
        }

        const rangeInputMin = BUI.Component.create<BUI.NumberInput>(() => {
            return BUI.html`
                <bim-number-input slider min='0' max='0.99' value='0' sensitivity='0.3' step='0.01' style='max-width:8.12rem;margin-left:0.75rem'/>
            `
        })
        rangeInputMin.onchange = (event) => {
            if (!event.target) return
            const minValue = (event.target as BUI.NumberInput).value
            if (rangeInputMax.value < minValue) {
                rangeInputMax.value = minValue + 0.01
            }
        }
        const rangeInputMax = BUI.Component.create<BUI.NumberInput>(() => {
            return BUI.html`
                <bim-number-input slider min='0.01' max='1' value='1' sensitivity='0.3' step='0.01' style='max-width:8.12rem;margin-left:0.75rem'/>
            `
        })
        rangeInputMax.onchange = (event) => {
            if (!event.target) return
            const maxValue = (event.target as BUI.NumberInput).value
            if (rangeInputMin.value > maxValue) {
                rangeInputMin.value = maxValue - 0.01
            }
        }
        const rangeInterval = BUI.Component.create<BUI.Button>(() => {
            return BUI.html`
                <bim-button 
                    @click=${(e:Event) => {
                        (e.target as BUI.Button).label = (e.target as BUI.Button).label=='Inside'?'Outside':'Inside';
                        (e.target as BUI.Button).icon = (e.target as BUI.Button).label=='Inside'?'iconoir:arrow-separate':'iconoir:arrow-union'
                    }} 
                    label='Inside'
                    tooltip-text='Click to filter elements inside or outside the chosen range'
                    style='width:8.12rem'
                    icon='iconoir:arrow-separate'
                >
                </bim-button>
            `
        })
        const rangeCost = BUI.Component.create<BUI.Button>(() => {
            return BUI.html`
                <bim-button 
                    @click=${(e:Event) => {
                        if ((e.target as BUI.Button).label=='Normal'){
                            (e.target as BUI.Button).label = 'Cost';
                            (e.target as BUI.Button).icon = 'mynaui:dollar-square'
                            rangeInputMax.max = 1000000
                            rangeInputMin.max = 999999
                            rangeInputMax.min = 1
                            rangeInputMax.value = 1000000
                            rangeInputMax.step = 10
                            rangeInputMin.step = 10
                            rangeInputMax.suffix = '$'
                            rangeInputMin.suffix = '$'
                            rangeInputMax.sensitivity = 100
                            rangeInputMin.sensitivity = 100
                        } else {
                            (e.target as BUI.Button).label = 'Normal';
                            (e.target as BUI.Button).icon = 'ant-design:field-binary-outlined'
                            rangeInputMax.max = 1
                            rangeInputMin.max = 0.99
                            rangeInputMax.min = 0.01
                            rangeInputMax.value = 1
                            rangeInputMax.step = 0.01
                            rangeInputMin.step = 0.01
                            rangeInputMax.suffix = ''
                            rangeInputMin.suffix = ''
                            rangeInputMax.sensitivity = 0.3
                            rangeInputMin.sensitivity = 0.3
                        }
                    }} 
                    label='Normal'
                    tooltip-text='Click to filter elements using range between 0 and 1 or the cost itself'
                    style='width:8.12rem'
                    icon='ant-design:field-binary-outlined'
                >
                </bim-button>
            `
        })
        const runResourceCostAnalysis = async ({
            btn,
            resource,
            colorscale,
            filteredCostItems,
        }: {
            btn: string
            resource: string
            colorscale: string
            filteredCostItems: FilteredCostItemsByModel
        }) => {
            const startTimeResourceCostData = performance.now()
            const resourceAnalysisResults = await Promise.all(
                Object.entries(filteredCostItems).map(async ([modelId, costItems]) => {
                    let resourceCurrency = 'nd'
                    const elemResourcesMap: Record<number, number> = {}
                    const elemCostCountMap: Record<number, number> = {}
                    const elemResourcesDetailsMap: Record<number, ResourceDetail[]> = {}
                    const categoryElementsMap: Record<string, CategoryElementResource[]> = {}

                    const costItemMeta = costItems
                        .map((costItem) => {
                            const elemId = getLocalId(getItemRelationArray(costItem, 'Controls')?.[0])
                            const cvId = getLocalId(getItemRelationArray(costItem, 'CostValues')?.[0])
                            if (typeof elemId !== 'number' || typeof cvId !== 'number') return null
                            return { elemId, cvId }
                        })
                        .filter((entry): entry is {elemId: number, cvId: number} => entry !== null)

                    const costValueIds = new Set<number>()
                    const elementIds = new Set<number>()
                    for (const { elemId, cvId } of costItemMeta) {
                        costValueIds.add(cvId)
                        elementIds.add(elemId)
                    }

                    const costValuesById = await getCachedCostValuesShallow(modelId, costValueIds)
                    const unitBasisIds = new Set<number>()
                    const componentIds = new Set<number>()
                    for (const { cvId } of costItemMeta) {
                        const costValue = costValuesById.get(cvId)
                        const unitBasisId = getLocalId(getItemRelationArray(costValue, 'UnitBasis')?.[0])
                        const componentId = getLocalId(getItemRelationArray(costValue, 'Components')?.[0])
                        if (typeof unitBasisId === 'number') unitBasisIds.add(unitBasisId)
                        if (typeof componentId === 'number') componentIds.add(componentId)
                    }

                    const [unitBasisById, componentsById, modelItemsById] = await Promise.all([
                        getCachedUnitBasis(modelId, unitBasisIds),
                        getCachedComponents(modelId, componentIds),
                        getCachedModelItemsData(modelId, elementIds),
                    ])

                    const priceAnalysisComponentIds = new Set<number>()
                    for (const component of componentsById.values()) {
                        for (const priceAnalysisComponent of getItemRelationArray(component, 'Components') ?? []) {
                            const pacId = getLocalId(priceAnalysisComponent)
                            if (typeof pacId === 'number') {
                                priceAnalysisComponentIds.add(pacId)
                            }
                        }
                    }
                    const priceAnalysisComponentById = await getCachedPriceAnalysisComponents(modelId, priceAnalysisComponentIds)

                    for (const { elemId, cvId } of costItemMeta) {
                        const costValue = costValuesById.get(cvId)
                        if (!costValue) continue

                        const unitBasisReference = getItemRelationArray(costValue, 'UnitBasis')?.[0]
                        const elemQuantity = getItemAttributeValue<number>(unitBasisReference, 'ValueComponent')
                        if (typeof elemQuantity !== 'number') continue

                        const unitBasisId = getLocalId(unitBasisReference)
                        const unitBasis = typeof unitBasisId === 'number' ? unitBasisById.get(unitBasisId) : undefined
                        const elemQuantityUnitMeasure = convertUnits(
                            String(getItemAttributeValue(getItemRelationArray(unitBasis, 'UnitComponent')?.[0], 'Name') ?? 'nd'),
                        )

                        const componentId = getLocalId(getItemRelationArray(costValue, 'Components')?.[0])
                        const component = typeof componentId === 'number' ? componentsById.get(componentId) : undefined
                        if (!component) continue

                        const resourceValues: number[] = []
                        const resourceDetails: ResourceDetail[] = []
                        for (const priceAnalysisComponentReference of getItemRelationArray(component, 'Components') ?? []) {
                            const priceAnalysisComponentId = getLocalId(priceAnalysisComponentReference)
                            const priceAnalysisComponent = typeof priceAnalysisComponentId === 'number'
                                ? priceAnalysisComponentById.get(priceAnalysisComponentId)
                                : undefined
                            if (!priceAnalysisComponent) continue
                            if (getItemAttributeValue(priceAnalysisComponent, 'Category') !== resource) continue

                            const appliedValue = getItemRelationArray(priceAnalysisComponent, 'AppliedValue')?.[0]
                            const resourceUnitCost = getItemAttributeValue<number>(appliedValue, 'ValueComponent')
                            if (typeof resourceUnitCost !== 'number') continue

                            const unitComponent = getItemRelationArray(appliedValue, 'UnitComponent')?.[0]
                            resourceCurrency = convertCurrency(
                                String(getItemAttributeValue(unitComponent, 'Currency') ?? 'nd'),
                            )
                            resourceValues.push(resourceUnitCost * elemQuantity)
                            resourceDetails.push({
                                resourceUnitCost: `${resourceUnitCost} ${resourceCurrency}`,
                                elemQuantity: `${Math.round(elemQuantity * 100) / 100} ${elemQuantityUnitMeasure}`,
                                resourceDescription: String(getItemAttributeValue(priceAnalysisComponent, 'Description') ?? ''),
                                resourceName: String(getItemAttributeValue(priceAnalysisComponent, 'Name') ?? 'nd'),
                            })
                        }

                        if (resourceDetails.length > 0) {
                            elemResourcesDetailsMap[elemId]
                                ? elemResourcesDetailsMap[elemId].push(...resourceDetails)
                                : elemResourcesDetailsMap[elemId] = resourceDetails
                        }

                        if (resourceValues.length === 0) continue
                        const resourceCost = resourceValues.reduce((sum, value) => sum + value, 0)
                        elemResourcesMap[elemId] = (elemResourcesMap[elemId] ?? 0) + resourceCost
                        elemCostCountMap[elemId] = (elemCostCountMap[elemId] ?? 0) + 1
                    }

                    for (const [elemIdKey, totalResourceCost] of Object.entries(elemResourcesMap)) {
                        const elemId = Number(elemIdKey)
                        const item = modelItemsById.get(elemId)
                        if (!item) continue
                        const itemCategory = String(getItemAttributeValue(item, '_category') ?? '')
                        if (!itemCategory) continue

                        const elemData: CategoryElementResource = {
                            elemModel: modelId,
                            elemId,
                            elemName: String(getItemAttributeValue(item, 'Name') ?? 'nd'),
                            totalResourceCost,
                            currency: resourceCurrency,
                        }
                        categoryElementsMap[itemCategory]
                            ? categoryElementsMap[itemCategory].push(elemData)
                            : categoryElementsMap[itemCategory] = [elemData]
                    }

                    return {
                        model: modelId,
                        resourceCurrency,
                        elemResourcesMap,
                        elemCostCountMap,
                        categoryElementsMap,
                        elemResourcesDetailsMap,
                    } satisfies ResourceModelAnalysisResult
                }),
            )
            const resourceCostDataElapsed = ((performance.now() - startTimeResourceCostData) / 1000).toFixed(2)
            console.log(`TIME ${resourceCostDataElapsed} s: get resource cost data`)

            const modelResourcesMap: Record<string, Record<number, number>> = {}
            for (const result of resourceAnalysisResults) {
                modelResourcesMap[result.model] = result.elemResourcesMap
            }

            const [colorMap, normalizedValue] = normalizeAndMapToColor(
                flattenModelMap(modelResourcesMap),
                colorscale,
                rangeInputMin.value,
                rangeInputMax.value,
                rangeInterval.label,
                rangeCost.label,
            )
            const colorMapKeySet = new Set(Object.keys(colorMap))
            const resourceRows: BUI.TableGroupData<DynamicResourceTableData>[] = []
            const resourceCostPerGroupedTable: Record<string, ResourceGroupSummary> = {}
            const selectedItemsModelIdMap: OBC.ModelIdMap = {}
            let countCostItems = 0
            let countResources = 0

            for (const result of resourceAnalysisResults) {
                for (const [itemCategory, elements] of Object.entries(result.categoryElementsMap)) {
                    for (const element of elements) {
                        if (!colorMapKeySet.has(String(element.elemId))) continue
                        addToModelIdMap(selectedItemsModelIdMap, element.elemModel, element.elemId)
                        countCostItems += result.elemCostCountMap[element.elemId] ?? 0

                        for (const resourceDetail of result.elemResourcesDetailsMap[element.elemId] ?? []) {
                            const resourceUnitCost = Number(resourceDetail.resourceUnitCost.split(' ')[0])
                            const elementQuantity = Number(resourceDetail.elemQuantity.split(' ')[0])
                            const resourceCost = Math.round((resourceUnitCost * elementQuantity) * 100) / 100
                            resourceRows.push({
                                data: {
                                    Model: element.elemModel,
                                    ItemId: element.elemId,
                                    ElementName: element.elemName,
                                    ElementIfcClass: itemCategory,
                                    ResourceName: resourceDetail.resourceName,
                                    ResourceDescription: resourceDetail.resourceDescription,
                                    ResourceCost: `${resourceCost} ${element.currency}`,
                                    ResourceUnitCost: resourceDetail.resourceUnitCost,
                                    ElementQuantity: resourceDetail.elemQuantity,
                                    NormalizedValue: '',
                                },
                            })
                            countResources += 1

                            addResourceGroupSummary(resourceCostPerGroupedTable, itemCategory, resourceCost, element.currency, {
                                model: element.elemModel,
                            })
                            addResourceGroupSummary(resourceCostPerGroupedTable, element.elemName, resourceCost, element.currency, {
                                model: element.elemModel,
                                itemId: element.elemId,
                            })
                            addResourceGroupSummary(resourceCostPerGroupedTable, resourceDetail.resourceName, resourceCost, element.currency, {
                                model: element.elemModel,
                                resourceDescription: resourceDetail.resourceDescription,
                                resourceUnitCost: resourceDetail.resourceUnitCost,
                            })
                        }
                    }
                }
            }

            const countItems = Object.values(selectedItemsModelIdMap)
                .reduce((sum, itemIds) => sum + itemIds.size, 0)

            const dynamicResourceTable = document.createElement("bim-table") as BUI.Table<DynamicResourceTableData>
            dynamicResourceTable.data = [{
                data: {
                    ElementName: '',
                    ElementIfcClass: '',
                    ResourceName: '',
                    ResourceDescription: '',
                    ResourceCost: '',
                    NormalizedValue: '',
                    ResourceUnitCost: '',
                    ElementQuantity: '',
                },
            }]
            dynamicResourceTable.data = resourceRows
            dynamicResourceTable.preserveStructureOnFilter = true
            dynamicResourceTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
            dynamicResourceTable.hiddenColumns = ['Model','ItemId']
            dynamicResourceTable.dataTransform = {
                ResourceCost: (value, rowData) => {
                    const { ElementName, ElementIfcClass, ResourceName } = rowData
                    if (!ElementName && !ResourceName && ElementIfcClass) {
                        if (value !== '') return value
                        return `${Math.round((resourceCostPerGroupedTable[ElementIfcClass]?.resourceCost ?? 0) * 100) / 100} ${resourceCostPerGroupedTable[ElementIfcClass]?.currency ?? ''}`
                    }
                    if (!ElementName && ResourceName && !ElementIfcClass) {
                        if (value !== '') return value
                        return `${Math.round((resourceCostPerGroupedTable[ResourceName]?.resourceCost ?? 0) * 100) / 100} ${resourceCostPerGroupedTable[ResourceName]?.currency ?? ''}`
                    }
                    if (ElementName && !ResourceName && !ElementIfcClass) {
                        if (value !== '') return value
                        const elementSummary = resourceCostPerGroupedTable[ElementName]
                        if (!elementSummary) return value
                        if (colorMap) {
                            return BUI.html`
                                <div style="display: flex; flex-direction:row; gap:1rem; min-width:100%">
                                    <div style="height:1rem; width: 1rem; margin-left: 2rem; border-radius:5px; 
                                        background-color:${colorMap[Number(elementSummary.itemId)]};
                                        color:${colorMap[Number(elementSummary.itemId)]};">.</div>
                                    <bim-label>${Math.round(elementSummary.resourceCost * 100) / 100} ${elementSummary.currency}</bim-label>
                                </div>
                            `
                        }
                        return `${Math.round(elementSummary.resourceCost * 100) / 100} ${elementSummary.currency}`
                    }
                    return value
                },
                ResourceDescription: (value, rowData) => {
                    const { ElementName, ElementIfcClass, ResourceName } = rowData
                    if (!ElementName && ResourceName && !ElementIfcClass) {
                        if (value !== '') return value
                        return resourceCostPerGroupedTable[ResourceName]?.resourceDescription ?? value
                    }
                    return value
                },
                ElementName: (value, rowData) => {
                    const { Model, ItemId } = rowData
                    let itemId = ItemId
                    let modelId = Model
                    if (!ItemId) itemId = Number(resourceCostPerGroupedTable[value]?.itemId)
                    if (!Model) modelId = resourceCostPerGroupedTable[value]?.model
                    return BUI.html`
                        <bim-label
                            @click=${async () => {
                                highlighter.highlightByID("select", {[modelId as string]: new Set<number>([itemId as number])}, false, true)
                                const guid = await fragments.modelIdMapToGuids({[modelId as string]: new Set<number>([itemId as number])})
                                await navigator.clipboard.writeText(guid[0])
                                }}
                            @mouseover=${({target}:{target:BUI.Label}) => {target.style.color = "rgba(36, 241, 234, 1)"}}
                            @mouseleave=${({target}:{target:BUI.Label}) => {target.style.removeProperty('color')}}
                        >${value}</bim-label>`
                },
                ResourceName: (value, rowData) => {
                    const { ElementIfcClass, ElementName } = rowData
                    if (!ElementName && !ElementIfcClass) {
                        return BUI.html`
                            <bim-label
                                @mouseover=${({target}:{target:BUI.Label}) => {
                                    const contextMenu = target.querySelector<BUI.ContextMenu>('bim-context-menu')
                                    if (!contextMenu) return
                                    contextMenu.visible = true
                                    target.style.color = "rgba(36, 241, 234, 1)"
                                    registerContextMenuOutsideClick(target)
                                }}
                                @mouseleave=${() => {
                                    // target.style.removeProperty('color')
                                }}>
                                ${value}
                                <bim-context-menu id="bim-context-menu-resource" style="max-width: 30rem; padding: 0.75rem;">
                                    <bim-label style="display: block; width:20rem; white-space: normal; overflow-wrap: break-word;">
                                        ${resourceCostPerGroupedTable[value]?.resourceUnitCost ? `Unit Cost: ${resourceCostPerGroupedTable[value].resourceUnitCost}` : 'No unit cost available'}
                                    </bim-label>
                                    <bim-label style="display: block; width:20rem; white-space: normal; overflow-wrap: break-word;">
                                        ${resourceCostPerGroupedTable[value]?.resourceDescription ? `Description: ${resourceCostPerGroupedTable[value].resourceDescription}` : 'No description available'}
                                    </bim-label>
                                </bim-context-menu>
                            </bim-label>`
                    }
                    return value
                },
                NormalizedValue: (value, rowData) => {
                    const { ItemId } = rowData
                    if (!ItemId) return value
                    const itemNormalizedValue = normalizedValue[ItemId]
                    return typeof itemNormalizedValue === 'number'
                        ? Math.round(itemNormalizedValue * 1000) / 1000
                        : value
                },
            }
            dynamicResourceTable.groupedBy = ['ElementName']
            dynamicResourceTable.columns = ['ElementName']
            dynamicResourceTable.hiddenColumns = ['Model','ItemId','ElementIfcClass','ElementName','NormalizedValue']

            await highlighter.clear()
            updateCountLabel({countItems, countCostItems, countResources})

            if (btn == 'Color') {
                const groupedColors = groupIdsByNormalizedValuePerModel(
                    components,
                    normalizedValue as Record<string, number>,
                    modelResourcesMap,
                    colorscale,
                )
                await highlightGroupedColors(groupedColors)
            } else if (btn == 'Select') {
                highlighter.highlightByID("select", selectedItemsModelIdMap, false, false)
            }

            const sortbyDirectionResourceCost = BUI.Component.create<BUI.Dropdown>(
                () => BUI.html`
                    <bim-button icon='meteor-icons:arrow-up' style="max-width:fit-content; z-index:100" tooltip-text='Ascending or descending order'
                        @click="${(e:Event) => {
                            if (!e.target) return
                            const button = e.target as BUI.Button
                            button.icon = button.icon=='meteor-icons:arrow-up' ? 'meteor-icons:arrow-down' : 'meteor-icons:arrow-up'
                            const ascending = button.icon=='meteor-icons:arrow-up' ? false : true
                            onSortDynamicResourceTable(dynamicResourceTable, sortbyResourceDropdown.value[0], ascending, resourceCostPerGroupedTable)}}">
                    </bim-button>`,
            )
            sortbyResourceDropdown.onchange = (e) => {
                if (!e.target) return
                const field = (e.target as BUI.Dropdown).value[0]
                const ascending = sortbyDirectionResourceCost.icon=='meteor-icons:arrow-up' ? false : true
                onSortDynamicResourceTable(dynamicResourceTable, field, ascending, resourceCostPerGroupedTable)
            }

            const resourceCostPanelControls = BUI.Component.create<HTMLDivElement>(() => {
                return BUI.html`
                    <div style=${BUI.styleMap({display:'flex', flexDirection:'column', gap:'10px', margin:'10px 10px 5px 10px'})}>
                        <div style="display: flex; gap: 0.5rem;">
                            <bim-button @click=${(e:Event) => onExpandTable(e,dynamicResourceTable)} label=${dynamicResourceTable.expanded ? "Collapse" : "Expand"} style="max-width:fit-content"></bim-button>
                            <bim-label>Group by:</bim-label>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('resource_groupby_element')!.style.removeProperty('background-color');
                                document.getElementById('resource_groupby_resource')!.style.removeProperty('background-color');
                                sortbyResourceDropdown_optionOne.label = 'ElementIfcClass'
                                sortbyResourceDropdown.value = []
                                dynamicResourceTable.groupedBy = ['ElementIfcClass','ElementName']
                                dynamicResourceTable.columns = ['ElementIfcClass','ElementName']
                                dynamicResourceTable.hiddenColumns = ['Model','ItemId','ElementIfcClass','ElementName','NormalizedValue']
                            }} id="resource_groupby_ifcclass" label="IFC Class" style="max-width:fit-content"></bim-button>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('resource_groupby_ifcclass')!.style.removeProperty('background-color');
                                document.getElementById('resource_groupby_resource')!.style.removeProperty('background-color');
                                sortbyResourceDropdown_optionOne.label = 'ElementName'
                                sortbyResourceDropdown.value = []
                                dynamicResourceTable.groupedBy = ['ElementName']
                                dynamicResourceTable.columns = ['ElementName']
                                dynamicResourceTable.hiddenColumns = ['Model','ItemId','ElementIfcClass','ElementName','NormalizedValue']
                            }} id="resource_groupby_element"  label="Element" style="max-width:fit-content; background-color:var(--background-200)"></bim-button>
                            <bim-button @click=${({target}:{target:BUI.Button}) => {
                                target.style.backgroundColor = 'var(--background-200)';
                                document.getElementById('resource_groupby_ifcclass')!.style.removeProperty('background-color');
                                document.getElementById('resource_groupby_element')!.style.removeProperty('background-color');
                                sortbyResourceDropdown_optionOne.label = 'ResourceName'
                                sortbyResourceDropdown.value = []
                                dynamicResourceTable.groupedBy = ['ResourceName']
                                dynamicResourceTable.columns = ['ResourceName']
                                dynamicResourceTable.hiddenColumns = ['Model','ItemId','ResourceName','NormalizedValue','ResourceDescription','ResourceUnitCost']
                            }} id="resource_groupby_resource"  label="Resource" style="max-width:fit-content"></bim-button>
                            <bim-label>Sort by:</bim-label>
                            ${sortbyResourceDropdown}
                            ${sortbyDirectionResourceCost}
                            <bim-label>Ghost mode:</bim-label>
                            <bim-button 
                                id='ghost-mode' 
                                @click=${async (e:Event) => {
                                    await onSetTransparencyToCostColor(e);
                                    const button = e.target as BUI.Button
                                    button.label = button.label=='Ghost' ? 'Reset' : 'Ghost'
                                }} 
                                label="Ghost"
                                tooltip-text="Set transparency to non-selected items. On the side, you can set their opacity. Ghost mode works only on cost analysis colored items."
                                style="max-width:fit-content; z-index:100">
                            </bim-button>
                            <bim-number-input
                                id='ghost-mode-opacity' slider step="0.01"value="0.5" min="0" max="1"
                                style="max-width:fit-content; z-index:100"
                                @change="${async ({ target }: { target: BUI.NumberInput }) => {
                                    await updateCostTransparentOpacity(target.value)
                                }}">
                            </bim-number-input>
                            <bim-text-input placeholder="Search..." @input=${(e:Event)=>{onSearch(e,dynamicResourceTable)}}></bim-text-input>
                            <bim-button @click=${() => {onClearPanel(panelDown),onClearPanel(panelRight)}} tooltip-title='Clear Panel' icon='carbon:clean' style="max-width:fit-content; z-index:100"></bim-button>
                        </div>
                    </div>`
            })
            const resourceCostPanel = BUI.Component.create<BUI.Panel>(() => {
                return BUI.html`
                    <bim-panel style="display:flex; flex-direction:column; gap:10px; margin:5px 15px 5px 15px; background-color:transparent; flex:1;">
                        ${resourceRows.length > 0 ? dynamicResourceTable : 'Any resource cost found for this category.'}
                    </bim-panel>
                `
            })

            panelDown.innerHTML = ''
            panelDown.appendChild(resourceCostPanelControls)
            panelDown.appendChild(resourceCostPanel)
        }
        const runTotalCostAnalysis = async ({
            btn,
            colorscale,
            filteredCostItems,
            normalization,
        }: {
            btn: string
            colorscale: string
            filteredCostItems: FilteredCostItemsByModel
            normalization?: string
        }) => {
            const startTimeTotalCostData = performance.now()
            const totalCostAnalysisResults = await Promise.all(
                Object.entries(filteredCostItems).map(async ([modelId, costItems]) => {
                    const costItemMeta = costItems
                        .map((costItem) => {
                            const relatedItem = getItemRelationArray(costItem, 'Controls')?.[0]
                            const itemId = getLocalId(relatedItem)
                            const itemCategory = getItemAttributeValue<string>(relatedItem, '_category')
                            const costItemObjectType = String(getItemAttributeValue(costItem, 'ObjectType') ?? 'nd')
                            const cvId = getLocalId(getItemRelationArray(costItem, 'CostValues')?.[0])
                            if (
                                typeof itemId !== 'number' ||
                                typeof itemCategory !== 'string' ||
                                typeof cvId !== 'number'
                            ) {
                                return null
                            }
                            return { itemId, itemCategory, costItemObjectType, cvId }
                        })
                        .filter((entry): entry is {itemId:number, itemCategory:string, costItemObjectType:string, cvId:number} => entry !== null)

                    const costValueIds = new Set<number>()
                    const itemIds = new Set<number>()
                    for (const { cvId, itemId } of costItemMeta) {
                        costValueIds.add(cvId)
                        itemIds.add(itemId)
                    }

                    const [costValuesById, modelItemsById, itemVolumesById] = await Promise.all([
                        getCachedCostValuesDeep(modelId, costValueIds),
                        getCachedModelItemsData(modelId, itemIds),
                        normalization === 'Volume'
                            ? getCachedItemVolumes(modelId, itemIds)
                            : Promise.resolve(new Map<number, number | undefined>()),
                    ])

                    const modelCostMap: Record<number, number> = {}
                    const modelCostCountMap: Record<number, number> = {}
                    const itemVolumeMap: Record<number, number | undefined> = {}

                    if (normalization === 'Volume') {
                        for (const [itemId, volume] of itemVolumesById) {
                            itemVolumeMap[itemId] = volume
                        }
                    }

                    for (const { itemId, costItemObjectType, cvId } of costItemMeta) {
                        modelCostCountMap[itemId] = (modelCostCountMap[itemId] ?? 0) + 1
                        const costValue = costValuesById.get(cvId)
                        const appliedValue = getItemRelationArray(costValue, 'AppliedValue')?.[0]
                        const appliedValueComponent = getItemAttributeValue<number>(appliedValue, 'ValueComponent')
                        if (typeof appliedValueComponent !== 'number') continue
                        if (costItemObjectType !== 'Cost assignment') continue
                        modelCostMap[itemId] = (modelCostMap[itemId] ?? 0) + appliedValueComponent
                    }

                    const { rows: panelRows } = buildElementCostRowsFromCostItems({
                        modelId,
                        costItems,
                        itemDataById: modelItemsById,
                        costValuesById,
                    })

                    return {
                        model: modelId,
                        modelCostMap,
                        modelCostCountMap,
                        itemVolumeMap,
                        panelRows,
                    } satisfies TotalCostModelAnalysisResult
                }),
            )
            const totalCostDataElapsed = ((performance.now() - startTimeTotalCostData) / 1000).toFixed(2)
            console.log(`TIME ${totalCostDataElapsed} s: whole process of getting total costs data`)

            const modelCostMapByModel: Record<string, Record<number, number>> = {}
            const modelCostCountMap: Record<string, Record<number, number>> = {}
            const modelVolumeMap: Record<string, Record<number, number | undefined>> = {}
            const allPanelRows: BUI.TableGroupData<DynamicCostTableData>[] = []

            for (const result of totalCostAnalysisResults) {
                modelCostMapByModel[result.model] = result.modelCostMap
                modelCostCountMap[result.model] = result.modelCostCountMap
                modelVolumeMap[result.model] = result.itemVolumeMap
                allPanelRows.push(...result.panelRows)
            }

            const normalizedCostByModel: Record<string, Record<number, number>> = {}
            const normalizedCostFlat: Record<string, number> = {}
            if (normalization === 'Volume') {
                for (const [modelId, itemCosts] of Object.entries(modelCostMapByModel)) {
                    normalizedCostByModel[modelId] = {}
                    for (const [itemIdKey, totalCost] of Object.entries(itemCosts)) {
                        const itemId = Number(itemIdKey)
                        const volume = modelVolumeMap[modelId]?.[itemId]
                        if (typeof volume !== 'number' || volume <= 0) continue
                        const normalizedCost = totalCost / volume
                        normalizedCostByModel[modelId][itemId] = normalizedCost
                        normalizedCostFlat[itemId] = normalizedCost
                    }
                }
            }

            const colorBaseMap = normalization === 'Volume'
                ? normalizedCostFlat
                : flattenModelMap(modelCostMapByModel)
            const [colorMap, normalizedValue] = normalizeAndMapToColor(
                colorBaseMap,
                colorscale,
                rangeInputMin.value,
                rangeInputMax.value,
                rangeInterval.label,
                rangeCost.label,
            )
            const colorMapKeySet = new Set(Object.keys(colorMap))
            const selectedItemsModelIdMap: OBC.ModelIdMap = {}
            for (const [modelId, itemCosts] of Object.entries(modelCostMapByModel)) {
                for (const itemId of Object.keys(itemCosts).map(Number)) {
                    if (colorMapKeySet.has(String(itemId))) {
                        addToModelIdMap(selectedItemsModelIdMap, modelId, itemId)
                    }
                }
            }

            const countItems = Object.values(selectedItemsModelIdMap)
                .reduce((sum, itemIds) => sum + itemIds.size, 0)
            const countCostItems = Object.entries(selectedItemsModelIdMap)
                .flatMap(([modelId, itemIds]) => Array.from(itemIds).map((itemId) => modelCostCountMap[modelId]?.[itemId] ?? 0))
                .reduce((sum, value) => sum + value, 0)

            updateCountLabel({
                countItems,
                countCostItems,
                countResources: 0,
            })

            const shouldRenderNormalizedPanel = btn === 'Color' && normalization === 'Volume'
            const filteredPanelRows = allPanelRows
                .filter(({ data }) => isModelIdMapSelected(selectedItemsModelIdMap, data.Model ?? '', data.ItemId))
                .map((row) => {
                    const modelId = row.data.Model
                    const itemId = row.data.ItemId
                    if (!modelId || typeof itemId !== 'number') return row

                    const nextRow: BUI.TableGroupData<DynamicCostTableData> = {
                        data: {
                            ...row.data,
                        },
                    }

                    if (shouldRenderNormalizedPanel) {
                        nextRow.data.ItemVolume = modelVolumeMap[modelId]?.[itemId] ?? 0
                        nextRow.data.NormalizedCost = normalizedCostByModel[modelId]?.[itemId] ?? 0
                        nextRow.data.NormalizedValue = typeof normalizedValue[itemId] === 'number'
                            ? normalizedValue[itemId] as number
                            : 0
                    }

                    return nextRow
                })

            if (btn == 'Color') {
                highlighter.highlightByID("select", {}, true, false)

                const startTimeColor = performance.now()
                const groupedColors = groupIdsByNormalizedValuePerModel(
                    components,
                    normalizedValue as Record<string, number>,
                    normalization === 'Volume' ? normalizedCostByModel : modelCostMapByModel,
                    colorscale,
                )
                await highlightGroupedColors(groupedColors)
                const colorElapsed = ((performance.now() - startTimeColor) / 1000).toFixed(2)
                console.log(`TIME ${colorElapsed} s: color elements using ranges color map (> 100 items)`)

                const startTimePanel = performance.now()
                renderElementCostPanel({
                    rows: filteredPanelRows,
                    normalization: shouldRenderNormalizedPanel,
                    colorMap,
                    hasAssignments: filteredPanelRows.length > 0,
                })
                const panelElapsed = ((performance.now() - startTimePanel) / 1000).toFixed(2)
                console.log(`TIME ${panelElapsed} s: total time to create and render cost table`)
            } else if (btn == 'Select') {
                highlighter.highlightByID("select", selectedItemsModelIdMap, false, false)
                renderElementCostPanel({
                    rows: filteredPanelRows,
                    hasAssignments: filteredPanelRows.length > 0,
                })
            }
        }

        const colorResourcesPanelSection = BUI.Component.create<BUI.PanelSection>(() => {
            return BUI.html`
                <bim-panel-section
                    label = "Cost Analysis"
                    icon = "ic:round-format-color-fill">
                    ${colorScaleDropdown}
                    ${resourcesDropdown}
                    ${categoriesDropdown}
                    ${unitMeasureDropdown}
                    <div style="display:flex; gap: 1rem; align-items:center">
                        <bim-label icon='mdi:slider'>Range</bim-label>
                        <bim-button tooltip-text="Info: this range filters the items resulting from the above choices" icon='material-symbols-light:info-outline-rounded' style="max-width:fit-content; height:fit-content; z-index:100; background:none; background-color:transparent !important"></bim-button>
                        <div style="display:flex; flex-direction:column; gap:0.75rem; flex-grow:1; align-items:center">
                            ${rangeInterval}
                            ${rangeCost}
                        </div>
                        <div style="display:flex; flex-direction:column; gap:0.75rem; flex-grow:1">
                            <div style="display: flex; justify-content:end">
                                <bim-label icon='material-symbols:line-start-circle-outline-rounded'>Min</bim-label>
                                ${rangeInputMin}
                            </div>
                            <div style="display: flex; justify-content:end">
                                <bim-label icon='material-symbols:line-end-circle-outline-rounded'>Max</bim-label>
                                ${rangeInputMax}
                            </div>
                        </div>
                    </div>
                    ${countLabel}
                    <div style="display: flex; gap: 0.5rem; margin-top: 0.5rem;">
                        <bim-button label='Color' @click=${onColorByCost}></bim-button>
                        <bim-button label='Select' @click=${onColorByCost}></bim-button>
                    </div>
                </bim-panel-section>
            `
        })
        // #endregion

        //append components in panels
        panelLeft.appendChild(modelsListPanelSection)
        panelLeft.appendChild(selectElementByGuidPanelSection)
        panelLeft.appendChild(spatialTreePanelSection)
        panelLeft.appendChild(propertiesPanelSection)
        panelLeft.appendChild(colorResourcesPanelSection)

        //advanced costs functions and components

        const onOpenElementXCostPanel = async (
            modelIdMap: OBC.ModelIdMap | undefined = undefined,
            normalization: boolean = false,
            colorMap?: Record<string, string>,
        ) => {
            panelDown.innerHTML = ''
            panelDown.appendChild(loadingLabel)
            panelDown.label = 'Element X Costs Panel'

            const selection = cleanModelIdMap(modelIdMap ?? highlighter.selection.select)
            if (Object.keys(selection).length === 0) {
                panelDown.innerHTML = ''
                panelDown.appendChild(noCostItemsLabel)
                return
            }

            const startTimeSelectionData = performance.now()
            const modelPanelResults = await Promise.all(
                Object.entries(selection).map(async ([modelId, itemIds]) => {
                    const selectedItemsById = await getCachedItemsWithAssignments(modelId, itemIds)
                    const selectedItems = [...itemIds]
                        .map((itemId) => selectedItemsById.get(itemId))
                        .filter((item): item is FRAGS.ItemData => Boolean(item))

                    const assignedCostItemIds = new Set<number>()
                    for (const item of selectedItems) {
                        for (const costItem of getItemRelationArray(item, 'HasAssignments') ?? []) {
                            if (getItemAttributeValue(costItem, '_category') !== 'IFCCOSTITEM') continue
                            const assignedCostItemId = getLocalId(costItem)
                            if (typeof assignedCostItemId === 'number') {
                                assignedCostItemIds.add(assignedCostItemId)
                            }
                        }
                    }

                    const costItemsById = await getCachedCostItemsWithValues(modelId, assignedCostItemIds)
                    const selectedCostItems = [...assignedCostItemIds]
                        .map((costItemId) => costItemsById.get(costItemId))
                        .filter((item): item is FRAGS.ItemData => Boolean(item))

                    const costValueIds = new Set<number>()
                    for (const costItem of selectedCostItems) {
                        for (const costValue of getItemRelationArray(costItem, 'CostValues') ?? []) {
                            const costValueId = getLocalId(costValue)
                            if (typeof costValueId === 'number') {
                                costValueIds.add(costValueId)
                            }
                        }
                    }

                    const [costValuesById, itemDataById] = await Promise.all([
                        getCachedCostValuesDeep(modelId, costValueIds),
                        getCachedModelItemsData(modelId, itemIds),
                    ])
                    const { rows, hasAssignments } = buildElementCostRowsFromCostItems({
                        modelId,
                        costItems: selectedCostItems,
                        itemDataById,
                        costValuesById,
                    })

                    return {
                        modelId,
                        rows,
                        hasAssignments,
                    }
                }),
            )
            const selectionDataElapsed = ((performance.now() - startTimeSelectionData) / 1000).toFixed(2)
            console.log(`TIME ${selectionDataElapsed} s: get data of selected items (within onOpenElementXCostPanel method)`)

            let rows = modelPanelResults.flatMap(({ rows: modelRows }) => modelRows)
            const hasAssignments = modelPanelResults.some(({ hasAssignments }) => hasAssignments)

            if (normalization) {
                const [colorscale = 'gnylrd'] = colorScaleDropdown.value.length > 0 ? colorScaleDropdown.value : ['gnylrd']
                const normalizedCostByItem: Record<string, Record<number, number>> = {}
                const normalizedCostFlat: Record<string, number> = {}
                const totalCostByItem: Record<string, Record<number, number>> = {}
                const itemVolumesByModel = Object.fromEntries(
                    await Promise.all(
                        Object.entries(selection).map(async ([modelId, itemIds]) => [
                            modelId,
                            await getCachedItemVolumes(modelId, itemIds),
                        ] as const),
                    ),
                )

                for (const row of rows) {
                    const modelId = row.data.Model
                    const itemId = row.data.ItemId
                    if (!modelId || typeof itemId !== 'number') continue
                    const cost = Number(String(row.data.Cost).split(' ')[0])
                    if (!Number.isFinite(cost)) continue
                    totalCostByItem[modelId] ??= {}
                    totalCostByItem[modelId][itemId] = (totalCostByItem[modelId][itemId] ?? 0) + cost
                }

                for (const [modelId, itemCosts] of Object.entries(totalCostByItem)) {
                    normalizedCostByItem[modelId] = {}
                    for (const [itemIdKey, totalCost] of Object.entries(itemCosts)) {
                        const itemId = Number(itemIdKey)
                        const itemVolume = itemVolumesByModel[modelId]?.get(itemId)
                        if (typeof itemVolume !== 'number' || itemVolume <= 0) continue
                        const normalizedCost = totalCost / itemVolume
                        normalizedCostByItem[modelId][itemId] = normalizedCost
                        normalizedCostFlat[itemId] = normalizedCost
                    }
                }

                const [, normalizedValue] = normalizeAndMapToColor(
                    normalizedCostFlat,
                    colorscale,
                    rangeInputMin.value,
                    rangeInputMax.value,
                    rangeInterval.label,
                    rangeCost.label,
                )

                rows = rows.map((row) => {
                    const modelId = row.data.Model
                    const itemId = row.data.ItemId
                    if (!modelId || typeof itemId !== 'number') return row

                    const itemVolume = itemVolumesByModel[modelId]?.get(itemId)
                    return {
                        data: {
                            ...row.data,
                            ItemVolume: itemVolume ?? 0,
                            NormalizedCost: normalizedCostByItem[modelId]?.[itemId] ?? 0,
                            NormalizedValue: typeof normalizedValue[itemId] === 'number'
                                ? normalizedValue[itemId] as number
                                : 0,
                        },
                    }
                })
            }

            const startTimePanel = performance.now()
            renderElementCostPanel({
                rows,
                normalization,
                colorMap,
                hasAssignments,
            })
            const panelElapsed = ((performance.now() - startTimePanel) / 1000).toFixed(2)
            console.log(`TIME ${panelElapsed} s: only create and append the cost table (within onOpenElementXCostPanel method)`)
        }

        const onOpenPriceAnalysis = (
            resourcesCostValues: FRAGS.ItemData[] | string | undefined,
            unitCostName: unknown,
            unitCostDescription: unknown,
            unitCost: unknown,
        ) => {
            //reset panel to update with new values
            panelRight.innerHTML = ''
            panelRight.label = 'Price Analysis'
            //table type
            type PriceAnalysisTableData = {
                Name: string;
                Cost: string;
                Quantity: string;
                Category: string;
            }
            //general unit cost info
            const unitCostInfo = BUI.Component.create<HTMLDivElement>(() => {
                return BUI.html`
                <div style=${BUI.styleMap({padding:'5px', fontSize:'var(--bim-ui_size-xs)', color:'var(--bim-ui_bg-contrast-60)'})}>
                    <div style=${BUI.styleMap({margin:'5px'})}>Name: ${String(unitCostName ?? 'nd')}</div>
                    <div style=${BUI.styleMap({margin:'5px'})}>Description: ${String(unitCostDescription ?? 'nd')}</div>
                    <div style=${BUI.styleMap({margin:'5px'})}>Unit cost: ${String(unitCost ?? 'nd')}</div>
                </div>
                `
            })
            panelRight.appendChild(unitCostInfo)

            //div if there is no price analysis
            const noPriceAnalysisDiv = BUI.Component.create<HTMLDivElement>(() => {
                return BUI.html`
                <div style=${BUI.styleMap({padding:'5px', fontSize:'var(--bim-ui_size-m)', color:'red'})}>
                    <div style=${BUI.styleMap({margin:'5px'})}>This item does not have price analysis related!</div>
                </div>
                `
            })
            //price analysis table creation
            if (Array.isArray(resourcesCostValues)){
                const priceAnalysisTable = document.createElement("bim-table") as BUI.Table<PriceAnalysisTableData>
                priceAnalysisTable.data = [
                    {
                        data: {
                            Name: '',
                            Cost: '',
                            Quantity: '',
                            Category: ''
                        },
                    },
                ]
                priceAnalysisTable.data = [] //reset table to remove the previous empty line
                priceAnalysisTable.preserveStructureOnFilter = true
                priceAnalysisTable.style.borderRadius = "var(--bim-text-input--bdrs, var(--bim-ui_size-4xs))"
                priceAnalysisTable.style.padding = '5px'
                //loop over component of cost item extracting data
                for (const component of resourcesCostValues){
                    let row: BUI.TableGroupData<PriceAnalysisTableData> = {
                        data: {},
                    }
                    row.data.Name = component['Name'] ? component['Name'].value : component['Description'] ? component['Description'].value : 'nd'
                    row.data.Category = component['Category'] ? component['Category'].value : 'nd'
                    const valueComponent = component['AppliedValue'][0]['ValueComponent'].value
                    const unitComponent = component['AppliedValue'][0]['UnitComponent'][0]['Currency'].value
                    row.data.Cost = `${Math.round(valueComponent*1000)/1000} ${convertCurrency(unitComponent)}`
                    const unitBasisValueComponent = component['UnitBasis'][0]['ValueComponent'].value
                    const unitBasisUnitComponent = component['UnitBasis'][0]['UnitComponent'][0]['Name'].value
                    row.data.Quantity = `${Math.round(unitBasisValueComponent*1000)/1000} ${convertUnits(unitBasisUnitComponent)}`
                    priceAnalysisTable.data.push(row)
                }
                //append table to the panel
                panelRight.appendChild(priceAnalysisTable)
            } else {
                panelRight.appendChild(noPriceAnalysisDiv)
            }
            //update grid layout if panel is closed
            const gridLayout = floatingGrid.layout as any
            if (!gridLayout.includes('right')){
                onSetLayout({target:'right'})
            }
        }
        
        //FLOATING GRID TO HOST THE TOOLBAR
        const floatingGrid = BUI.Component.create<BUI.Grid>(() => {
            return BUI.html`
                <bim-grid
                    floating
                    style="padding: 5px; gap: 5px">
                </bim-grid>
            `;
        })
        floatingGrid.resizeableAreas = true

        //TOOLBAR COMPONENT
        const toolbar = BUI.Component.create<BUI.Toolbar>(() => {
            return BUI.html`
            <bim-toolbar style="justify-self:center; align-content:center; background: rgba(0,0,0,0.5); z-index:50" class="blur-background-container">
                <bim-toolbar-section id="test-section" label="TEST" style="display:${devElementsVisibility}">
                    <bim-button
                        label="Sample"
                        tooltip-title="Load sample IFC models. Only for developers."
                        @click=${() => {
                            loadIfcFile("/assets/Sample_with costs.ifc",'Sample_with costs')
                            loadIfcFile("/assets/SFH_with costs.ifc",'SFH_with costs')
                            }}>
                    </bim-button>
                    <bim-button
                        label='Volume'
                        tooltip-title="Print volume of selected item"
                        @click=${getVolume}
                    ></bim-button>
                    <bim-button
                        label='Categories'
                        tooltip-title="Print all categories in loaded models"
                        @click=${async () => {
                            const categories = await getAllCategories()
                            const lC = new Set(categories)
                            const filteredCategories = [...new Set(importedCategories.filter(x => lC.has(x)))]
                            filteredCategories.push('ALL CLASSES')
                            console.log(filteredCategories)
                            categoriesDropdown.innerHTML = ''
                            categoriesDropdown.innerHTML = `<bim-option label='ciao' style="padding:0 10px 0 10px"></bim-option>`
                            updateCategoriesDropdown({listCategories:filteredCategories})
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Scene">
                    <bim-button
                        id='world'
                        icon="tabler:world-cog"
                        tooltip-title="Scene Visibility Settings"
                        @click=${onSetLayout}>
                    </bim-button>
                    <bim-button
                        id='screenshot'
                        icon="streamline-flex:screenshot-solid"
                        tooltip-title="Screenshot"
                        @click=${takeScreenshot}>
                    </bim-button>
                    <bim-button
                        tooltip-title="Center View"
                        icon="material-symbols:center-focus-weak"
                        @click=${async ()=>{
                            await world.camera.controls.setLookAt(30,30,30,0,0,0)
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Samples">
                    <bim-dropdown verical placeholder="Load...">
                        <bim-option>
                            <bim-button
                                icon="fluent:building-48-regular"
                                label="Sample Partial Building"
                                @click=${() => {
                                        loadFragmentFile("/FRAG/Sample_totalCostAndPriceAnalysis.frag")
                                    }}>
                            </bim-button>
                        </bim-option>
                    </bim-dropdown>
                </bim-toolbar-section>
                <bim-toolbar-section label="IFC">
                    <bim-button
                        icon="tabler:cube-plus"
                        tooltip-title="Load IFC model"
                        @click=${onLoadIfc}>
                    </bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Fragments">
                    <bim-button
                        tooltip-title="Import"
                        icon="lucide:upload"
                        @click=${onFragmentsImport}
                    ></bim-button>
                    <bim-button
                        style="display:${devElementsVisibility}"
                        tooltip-title="Export"
                        icon="lucide:download"
                        @click=${onFragmentsExport}
                    ></bim-button>
                    <bim-button
                        style="display:${devElementsVisibility}"
                        tooltip-title="Print on console selected element fragment"
                        icon="carbon:fragments"
                        @click=${onFragmentsPrint}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Dispose all models"
                        icon="tabler:trash"
                        @click=${() => {
                            for (const [modelId] of fragments.list) {
                                fragments.core.disposeModel(modelId);
                            }
                        }}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Panels">
                    <bim-button
                        id="left"
                        icon="mynaui:panel-left-open"
                        tooltip-title="Open/Close left panel"
                        @click=${onSetLayout}>
                    </bim-button>
                    <bim-button
                        id="down"
                        icon="mynaui:panel-bottom-open"
                        tooltip-title="Open/Close bottom panel"
                        @click=${onSetLayout}>
                    </bim-button>
                    <bim-button
                        id="right"
                        icon="mynaui:panel-right-open"
                        tooltip-title="Open/Close right panel"
                        @click=${onSetLayout}>
                    </bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Selection">
                    <bim-button
                        icon="tabler:deselect"
                        tooltip-title="Clear Selection"
                        @click=${() => {highlighter.clear()}}>
                    </bim-button>
                    <bim-button
                        icon="weui:previous-filled"
                        tooltip-title="Select Previous"
                        @click=${() => {highlighter.highlightByID('select', previousSelection, false, true)}}>
                    </bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="Visibility">
                    <bim-button
                        tooltip-title="Hide Selection"
                        icon="mdi:hide-outline"
                        @click=${onHide}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Isolate Selection"
                        icon="mdi:show-outline"
                        @click=${onIsolate}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Invert Visibility"
                        icon="material-symbols:change-circle-outline-rounded"
                        @click=${onInvertVisibility}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Transparency Selection"
                        icon="mdi:arrange-send-backward"
                        @click=${() => {onSetTransparency()}}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Transparency Non-Selection"
                        icon="mdi:arrange-bring-forward"
                        @click=${() => {onSetTransparencyToNotSelectedElements()}}
                    ></bim-button>
                    <bim-button
                        tooltip-title="Reset Visibility"
                        icon="tabler:sun-filled"
                        @click=${onResetVisibility}
                    ></bim-button>
                </bim-toolbar-section>
                <bim-toolbar-section label="5D">
                    <bim-button
                        id='elementXCostButton'
                        tooltip-title="Show costs of selected elements"
                        icon="fontisto:dollar"
                        @click=${()=>{onOpenElementXCostPanel()}}
                    ></bim-button>
                    <bim-button
                        style = "display:none"
                        tooltip-title="Open cost assignment panel of selected elements - organized by cost item"
                        icon="tabler:filter-2-dollar"
                        @click=${() => {console.log('TO DO ...')}}
                    ></bim-button>
                </bim-toolbar-section>
            </bim-toolbar>
            `;
        })

        const panelDownHeight = '50%'
        const panelLeftWidth = '25%'
        const panelRightWidth = '25%'
        const left_right = {
                template: `
                    "panelLeft toolbar panelRight" auto
                    "panelLeft empty panelRight" 1fr
                    /${panelLeftWidth} 1fr ${panelRightWidth}
                `,
                elements: {
                    panelLeft,
                    panelRight,
                    toolbar
                }
            }
        const left_down = {
                template: `
                    "panelLeft toolbar" auto
                    "panelLeft empty" 1fr
                    "panelLeft panelDown" ${panelDownHeight}
                    /${panelLeftWidth} 1fr
                `,
                elements: {
                    panelLeft,
                    panelDown,
                    toolbar
                }
            }
        const right_down = {
                template: `
                    "toolbar panelRight" auto
                    "empty panelRight" 1fr
                    "panelDown panelRight" ${panelDownHeight}
                    /1fr ${panelRightWidth}
                `,
                elements: {
                    panelRight,
                    panelDown,
                    toolbar
                }
            }
        const left_down_right = {
            template: `
                "panelLeft toolbar panelRight" auto
                "panelLeft empty panelRight" 1fr
                "panelLeft panelDown panelDown" ${panelDownHeight}
                /${panelLeftWidth} 1fr ${panelRightWidth}
            `,
            elements: {
                panelLeft,
                panelRight,
                panelDown,
                toolbar
            }
        }
        //GRID LAYOUT
        floatingGrid.layouts = {
            main: {
                template: `
                    "toolbar" auto
                    "empty" 1fr
                    /1fr
                `,
                elements: {
                    toolbar
                }
            },
            world: {
                template: `
                    "toolbar panelWorldSettings" auto
                    "empty panelWorldSettings" 1fr
                    /1fr ${panelRightWidth}
                `,
                elements: {
                    panelWorldSettings,
                    toolbar
                }
            },
            left: {
                template: `
                    "panelLeft toolbar" auto
                    "panelLeft empty" 1fr
                    /${panelLeftWidth} 1fr
                `,
                elements: {
                    panelLeft,
                    toolbar
                }
            },
            right: {
                template: `
                    "toolbar panelRight" auto
                    "empty panelRight" 1fr
                    /1fr ${panelRightWidth}
                `,
                elements: {
                    panelRight,
                    toolbar
                }
            },
            down: {
                template: `
                    "toolbar" auto
                    "empty" 1fr
                    "panelDown" ${panelDownHeight}
                    /1fr
                `,
                elements: {
                    panelDown,
                    toolbar
                }
            },
            leftright: left_right,
            rightleft: left_right,
            leftdown: left_down,
            downleft: left_down,
            rightdown: right_down,
            downright: right_down,
            leftdownright: left_down_right,
            leftrightdown: left_down_right,
            rightdownleft: left_down_right,
            rightleftdown: left_down_right,
            downrightleft: left_down_right,
            downleftright: left_down_right,
        }
        floatingGrid.layout = "main" as any //set active layout

        const viewerContainer = document.getElementById('main-viewer') as HTMLElement | null
        if (!viewerContainer) return cleanupViewer
        viewerContainer.appendChild(floatingGrid) //append grid to the viewer container
        registerCleanup(() => {
            floatingGrid.remove()
        })
        // #endregion
        
        //stats board
        const stats = new Stats()
        stats.showPanel(2)
        document.body.append(stats.dom)
        stats.dom.style.position = "fixed"
        stats.dom.style.left = "0px"
        stats.dom.style.bottom = "0px"
        stats.dom.style.top = "unset"
        stats.dom.style.right = "unset"
        stats.dom.style.zIndex = "999" // z-index visibile sopra altri elementi, se necessario
        stats.dom.style.display = devElementsVisibility
        registerCleanup(() => {
            stats.dom.remove()
        })
        world.renderer.onBeforeUpdate.add(() => stats.begin())
        world.renderer.onAfterUpdate.add(() => stats.end())

        return cleanupViewer
    }

    // #region FINAL PART
    React.useEffect(() => {
        let cleanup: ViewerCleanup | undefined
        let isDisposed = false

        void (async () => {
            try {
                cleanup = await setViewer() //set the viewer, devMode default = false
                if (isDisposed) {
                    cleanup()
                }
            } catch (error) {
                console.error('Failed to initialize MainViewer', error)
            }
        })()

        return () => {
            isDisposed = true
            cleanup?.()
            components.dispose()
        }
    }, [components])

    return(
        <>
            <div
            id="overlay"
            style={{
                position: "absolute",
                top: "10%",
                left: "40%",
                width: "20%",
                zIndex: 1000,
                pointerEvents: "none"
            }}>
            </div>
            <bim-viewport
                id="main-viewer"
                className="viewer"
            />
        </>
    )
    // #endregion
}
