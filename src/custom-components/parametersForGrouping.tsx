// parameter from Ray data to choose to group data
export const groupColumn = {
    lod0 : 'SA2_NAM', //DIVISION_N or SA2_NAME
    lod0_boundaries : 'SA2_NAME16', //the parameter is the same but with a different name
    lod0_population : 'SA2_NAME16', //the parameter is the same but with a different name
    lod1 : 'SA1_MAI', //SA1_MAI or MB_CODE
    lod1_population : 'SA1_MAIN16',
    lod1_boundaries : 'SA1_MAIN16',
}

// IFC category for generated bars
export const barsIfcCategory = 'IfcBuildingElementProxy'

// scale factor to scale the map
export const coordinatesScaleFactor = 1 //it is a reducing factor, so it reduce the scale by the factor

// height to use to normalize data per each lod
export const normalizationHeight = {
    notNormalized : 1, // this value only divide the not normalized value by this number, to not have bars too high
    lod0 : 5000,
    lod1 : 1000,
    lod2 : 300,
}

// side length of the base square of bars
export const barsBase = {
    lod0 : 250,
    lod1 : 75,
    lod2 : 10,
}

// CENTROID FROM: https://epsg.io/map#srs=28355&x=693145.6576212854&y=6090713.28243175&z=17&layer=streets
// EPSG: 28355
export const globalCentroid = {
    x : 693145.6576212854,
    y : 6090713.28243175,
}

export const allMaterials = [
    'Aluminm',
    'Bitumen',
    'Carpet',
    'Ceramcs',
    'Concret',
    'Copper',
    'Glass',
    'Insultn',
    'Paint',
    'Plstrbr',
    'Plastcs',
    'Snd_nd_',
    'Steel',
    'Timber',
]

export const at_2015_conversion: { [key: string]: { explicit: string; category: string } } = {
    'SH': { explicit: "Single House", category: "Residential" },
    'SD': { explicit: "Semi-Detached House", category: "Residential" },
    'F0': { explicit: "Flat - Ground Level", category: "Residential" },
    'F3': { explicit: "Flat - 3 Storey", category: "Residential" },
    'F4': { explicit: "Flat - 4+ Storey", category: "Residential" },
    'CF13': { explicit: "Community Facility - 1-3 Storey", category: "Community Facility" },
    'CF47': { explicit: "Community Facility - 4-7 Storey", category: "Community Facility" },
    'C13': { explicit: "Commercial - 1-3 Storey", category: "Commercial" },
    'C36': { explicit: "Commercial - 3-6 Storey", category: "Commercial" },
    'C47': { explicit: "Commercial - 4-7 Storey", category: "Commercial" },
    'C835': { explicit: "Commercial - 8-35 Storey", category: "Commercial" },
    'DES13': { explicit: "Designated Use - 1-3 Storey", category: "Designated" },
    'DES47': { explicit: "Designated Use - 4-7 Storey", category: "Designated" },
    'DES835': { explicit: "Designated Use - 8-35 Storey", category: "Designated" },
    'I1': { explicit: "Industrial - Type 1", category: "Industrial" },
    'I2': { explicit: "Industrial - Type 2", category: "Industrial" },
}