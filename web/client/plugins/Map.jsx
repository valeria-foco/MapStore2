/*
 * Copyright 2017, GeoSolutions Sas.
 * All rights reserved.
 *
 * This source code is licensed under the BSD-style license found in the
 * LICENSE file in the root directory of this source tree.
*/

import PropTypes from 'prop-types';
import React from 'react';
import { connect, createPlugin } from '../utils/PluginsUtils';
import { loadFont } from '../utils/AgentUtils';
import assign from 'object-assign';
import Spinner from 'react-spinkit';
import './map/css/map.css';
import Message from '../components/I18N/Message';
import ConfigUtils from '../utils/ConfigUtils';
import { setMapResolutions, mapPluginLoad } from '../actions/map';
import { isString } from 'lodash';
import selector from './map/selector';
import mapReducer from "../reducers/map";
import layersReducer from "../reducers/layers";
import drawReducer from "../reducers/draw";
import boxReducer from '../reducers/box';
import highlightReducer from "../reducers/highlight";
import mapTypeReducer from "../reducers/maptype";
import additionalLayersReducer from "../reducers/additionallayers";
import mapEpics from "../epics/map";
import pluginsCreator from "./map/index";
import withScalesDenominators from "../components/map/enhancers/withScalesDenominators";
import { createFeatureFilter } from '../utils/FilterUtils';

/**
 * The Map plugin allows adding mapping library dependent functionality using support tools.
 * Some are already available for the supported mapping libraries (openlayers, leaflet, cesium), but it's possible to develop new ones.
 * An example is the MeasurementSupport tool that allows implementing measurement on a map.
 * The list of enabled tools can be configured using the tools property, as in the following example:
 *
 * ```
 * {
 * "name": "Map",
 * "cfg": {
 *     "tools": ["measurement", "locate", "overview", "scalebar", "draw", "highlight"]
 *   ...
 *  }
 * }
 * ```
 * // Each tool can be configured using the toolsOptions. Tool configuration can be mapping library dependent:
 * ```
 * "toolsOptions": {
 *        "scalebar": {
 *            "leaflet": {
 *                "position": "bottomright"
 *            }
 *            ...
 *        }
 *        ...
 *    }
 *
 * ```
 * or not
 * ```
 * "toolsOptions": {
 * "scalebar": {
 *        "position": "bottomright"
 *        ...
 *    }
 *    ...
 * }
 * ```
 * In addition to standard tools, you can also develop your own, ad configure them to be used.
 *
 * To do that you need to:
 *  - develop a tool Component, in JSX (e.g. TestSupport), for each supported mapping library
 * ```
 * const React = require('react');
 *    class TestSupport extends React.Component {
 *     static propTypes = {
 *            label: PropTypes.string
 *        }
 *        render() {
 *            alert(this.props.label);
 *            return null;
 *        }
 *    }
 *    module.exports = TestSupport;
 * ```
 *  - include the tool(s) in the requires section of plugins.js amd give it a name:
 * ```
 *    module.exports = {
 *        plugins: {
 *            MapPlugin: require('../plugins/Map'),
 *            ...
 *        },
 *        requires: {
 *            ...
 *            TestSupportLeaflet: require('../components/map/leaflet/TestSupport')
 *        }
 *    };
 * ```
 *  - configure the Map plugin including the new tool and related options. You can configure the tool to be used for each mapping library, giving it a name and impl attributes, where:
 * ```
 *    {
 *      "name": "Map",
 *      "cfg": {
 *        "shouldLoadFont": true,
 *        "fonts": ['FontAwesome'],
 *        "tools": ["measurement", "locate", "overview", "scalebar", "draw", {
 *          "leaflet": {
 *            "name": "test",
 *            "impl": "{context.TestSupportLeaflet}"
 *          }
 *          }],
 *        "toolsOptions": {
 *          "test": {
 *            "label": "Hello"
 *          }
 *          ...
 *        }
 *      }
 *    }
 * ```
 *  - name is a unique name for the tool
 *  - impl is a placeholder (“{context.ToolName}”) where ToolName is the name you gave the tool in plugins.js (TestSupportLeaflet in our example)
 *
 * You can also specify a list of fonts that have to be loaded before map rendering
 * if the shouldLoadFont is true
 * This font pre-load list is required if you're using canvas based mapping libraries (e.g. OpenLayers) and you need to show markers with symbols (e.g. Annotations).
 * For each font you must specify the font name used in the `@font-face` inside the "fonts" array property. Note: the `@font-face` declaration must be present in css of the page, otherwise the font can not be loaded anyway.
 * ```
 * {
 *    "name": "Map",
 *    "cfg": {
 *      "shouldLoadFont": true,
 *      "fonts": ['FontAwesome']
 *    }
 *  }
 * ```
 * For more info on metadata visit [fontfaceobserver](https://github.com/bramstein/fontfaceobserver)
 *
 * An additional feature to is limit the area and/or the minimum level of zoom in the localConfig.json file using "mapConstraints" property
 *
 *  e.g
 * ```json
 * "mapConstraints": {
 *  "minZoom": 12, // minimal allowed zoom used by default
 *  "crs":"EPSG:3857", // crs of the restrictedExtent
 *  "restrictedExtent":[ // limits the area accessible to the user to this bounding box
 *    1060334.456371965,5228292.734706056,
 *    1392988.403469052,5503466.036532691
 *   ],
 *   "projectionsConstraints": {
 *       "EPSG:1234": { "minZoom": 5 } // customization of minZoom for different projections
 *   }
 *  }
 * ```
 *
 * With this setup you can configure a restricted area and/or a minimum zoom level for the whole application.
 * If you have different reference systems for your maps, for each of them you can even set a minimum zoom
 * using the entry `projectionsConstraints` as written in the example.
 *
 * ```
 *
 * @memberof plugins
 * @class Map
 * @prop {array} additionalLayers static layers available in addition to those loaded from the configuration
 * @static
 * @example
 * // Adding a layer to be used as a source for the elevation (shown in the MousePosition plugin configured with showElevation = true)
 * {
 *   "cfg": {
 *     "additionalLayers": [{
 *         "type": "wms",
 *         "url": "http://localhost:8090/geoserver/wms",
 *         "visibility": true,
 *         "title": "Elevation",
 *         "name": "topp:elevation",
 *         "format": "application/bil16",
 *         "useForElevation": true,
 *         "nodata": -9999,
 *         "littleendian": false,
 *         "hidden": true
 *      }]
 *   }
 * }
 *
 */


class MapPlugin extends React.Component {
    static propTypes = {
        mapType: PropTypes.string,
        map: PropTypes.object,
        layers: PropTypes.array,
        additionalLayers: PropTypes.array,
        zoomControl: PropTypes.bool,
        mapLoadingMessage: PropTypes.string,
        loadingSpinner: PropTypes.bool,
        loadingError: PropTypes.string,
        tools: PropTypes.array,
        fonts: PropTypes.array,
        options: PropTypes.object,
        mapOptions: PropTypes.object,
        projectionDefs: PropTypes.array,
        toolsOptions: PropTypes.object,
        onResolutionsChange: PropTypes.func,
        actions: PropTypes.object,
        features: PropTypes.array,
        securityToken: PropTypes.string,
        shouldLoadFont: PropTypes.bool,
        elevationEnabled: PropTypes.bool,
        isLocalizedLayerStylesEnabled: PropTypes.bool,
        localizedLayerStylesName: PropTypes.string,
        currentLocaleLanguage: PropTypes.string,
        items: PropTypes.array,
        onLoadingMapPlugins: PropTypes.func,
        onMapTypeLoaded: PropTypes.func
    };

    static defaultProps = {
        mapType: 'leaflet',
        actions: {},
        zoomControl: false,
        mapLoadingMessage: "map.loading",
        loadingSpinner: true,
        tools: ["measurement", "scalebar", "draw", "highlight", "popup", "box"],
        options: {},
        mapOptions: {},
        fonts: ['FontAwesome'],
        toolsOptions: {
            measurement: {},
            locate: {},
            scalebar: {
                leaflet: {
                    position: "bottomright"
                }
            },
            overview: {
                overviewOpt: {
                    position: 'bottomright',
                    collapsedWidth: 25,
                    collapsedHeight: 25,
                    zoomLevelOffset: -5,
                    toggleDisplay: true
                },
                layers: [{type: "osm"}]
            }
        },
        securityToken: '',
        additionalLayers: [],
        shouldLoadFont: false,
        elevationEnabled: false,
        onResolutionsChange: () => {},
        items: [],
        onLoadingMapPlugins: () => {},
        onMapTypeLoaded: () => {}
    };
    state = {
        canRender: true
    };

    UNSAFE_componentWillMount() {
        const {shouldLoadFont, fonts} = this.props;

        // load each font before rendering (see issue #3155)
        if (shouldLoadFont && fonts) {
            this.setState({canRender: false});

            Promise.all(
                fonts.map(f =>
                    loadFont(f, {
                        timeoutAfter: 5000 // 5 seconds in milliseconds
                    }).catch((error) => {
                        console.warn("Fonts loading check for map style responded slowly or with an error. Fonts in map may not be rendered correctly. This is not necessarily an issue.", error);  // eslint-disable-line no-console
                    }
                    ))
            ).then(() => {
                this.setState({canRender: true});
            });

        }
        this.updatePlugins(this.props);
    }

    UNSAFE_componentWillReceiveProps(newProps) {
        if (newProps.mapType !== this.props.mapType || newProps.actions !== this.props.actions) {
            this.updatePlugins(newProps);
        }
    }

    getHighlightLayer = (projection, index, env) => {
        const plugins = this.state.plugins;
        return (<plugins.Layer type="vector" srs={projection} position={index} key="highlight" options={{name: "highlight"}} env={env}>
            {this.props.features.map( (feature) => {
                return (<plugins.Feature
                    msId={feature.id}
                    key={feature.id}
                    crs={projection}
                    type={feature.type}
                    style={feature.style || null }
                    geometry={feature.geometry}/>);
            })}
        </plugins.Layer>);
    };

    getTool = (tool) => {
        if (isString(tool)) {
            return {
                name: tool,
                impl: this.state.plugins.tools[tool]
            };
        }
        return tool[this.props.mapType] || tool;
    };

    getMapOptions = () => {
        return this.props.mapOptions && this.props.mapOptions[this.props.mapType] ||
            ConfigUtils.getConfigProp("defaultMapOptions") && ConfigUtils.getConfigProp("defaultMapOptions")[this.props.mapType];
    };

    renderLayers = () => {
        const projection = this.props.map.projection || 'EPSG:3857';
        const env = [];

        if (this.props.isLocalizedLayerStylesEnabled) {
            env.push({
                name: this.props.localizedLayerStylesName,
                value: this.props.currentLocaleLanguage
            });
        }
        const plugins = this.state.plugins;
        return [...this.props.layers, ...this.props.additionalLayers].filter(this.filterLayer).map((layer, index) => {
            return (
                <plugins.Layer
                    type={layer.type}
                    srs={projection}
                    position={index}
                    key={layer.id || layer.name}
                    options={layer}
                    securityToken={this.props.securityToken}
                    env={env}
                >
                    {this.renderLayerContent(layer, projection)}
                </plugins.Layer>
            );
        }).concat(this.props.features && this.props.features.length && this.getHighlightLayer(projection, this.props.layers.length, env) || []);
    };

    renderLayerContent = (layer, projection) => {
        const plugins = this.state.plugins;
        if (layer.features && layer.type === "vector") {
            return layer.features.filter(createFeatureFilter(layer.filterObj)).map( (feature) => {
                return (
                    <plugins.Feature
                        key={feature.id}
                        msId={feature.id}
                        type={feature.type}
                        crs={projection}
                        geometry={feature.geometry}
                        features={feature.features}
                        featuresCrs={ layer.featuresCrs || 'EPSG:4326' }
                        // FEATURE STYLE OVERWRITE LAYER STYLE
                        layerStyle={layer.style}
                        style={ feature.style || layer.style || null }
                        properties={feature.properties}/>
                );
            });
        }
        return null;
    };

    renderSupportTools = () => {
        // Tools passed by other plugins
        const toolsFromItems = this.props.items
            .filter(({Tool}) => !!Tool)
            .map(({Tool, name, cfg}) => <Tool {...cfg} key={name} mapType={this.props.mapType} />);

        return this.props.tools.map((tool) => {
            const Tool = this.getTool(tool);
            const options = this.props.toolsOptions[Tool.name] && this.props.toolsOptions[Tool.name][this.props.mapType] || this.props.toolsOptions[Tool.name] || {};
            return <Tool.impl key={Tool.name} {...options}/>;
        }).concat(toolsFromItems);
    };

    render() {
        if (this.props.map && this.state.canRender && this.state.plugins) {
            const {mapOptions = {}} = this.props.map;

            return (
                <this.state.plugins.Map id="map"
                    {...this.props.options}
                    projectionDefs={this.props.projectionDefs}
                    {...this.props.map}
                    mapOptions={assign({}, mapOptions, this.getMapOptions())}
                    zoomControl={this.props.zoomControl}
                    onResolutionsChange={this.props.onResolutionsChange}
                >
                    {this.renderLayers()}
                    {this.renderSupportTools()}
                </this.state.plugins.Map>
            );
        }
        if (this.props.loadingError) {
            return (<div style={{
                width: "100%",
                height: "100%",
                display: "flex",
                justifyContent: "center",
                alignItems: "center"
            }} className="mapErrorMessage">
                <Message msgId="map.loadingerror"/>:
                {this.props.loadingError}
            </div>);
        }
        return (<div style={{
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
            alignItems: "center"
        }} className="mapLoadingMessage">
            {this.props.loadingSpinner ? <Spinner spinnerName="circle" overrideSpinnerClassName="spinner"/> : null}
            <Message msgId={this.props.mapLoadingMessage}/>
        </div>);
    }
    filterLayer = (layer) => {
        return !layer.useForElevation || this.props.mapType === 'cesium' || this.props.elevationEnabled;
    };
    updatePlugins = (props) => {
        this.currentMapType = props.mapType;
        props.onLoadingMapPlugins(true);
        // reset the map plugins to avoid previous map library in children
        this.setState({plugins: undefined });
        pluginsCreator(props.mapType, props.actions).then((plugins) => {
            // #6652 fix mismatch on multiple concurrent plugins loading
            // to make the last mapType match the list of plugins
            if (plugins.mapType === this.currentMapType) {
                this.setState({plugins});
                props.onLoadingMapPlugins(false, props.mapType);
                props.onMapTypeLoaded(true, props.mapType);
            }
        });
    };
}

export default createPlugin('Map', {
    component: connect(selector, {
        onResolutionsChange: setMapResolutions,
        onMapTypeLoaded: mapPluginLoad
    })(withScalesDenominators(MapPlugin)),
    reducers: {
        map: mapReducer,
        layers: layersReducer,
        draw: drawReducer,
        box: boxReducer,
        highlight: highlightReducer,
        maptype: mapTypeReducer,
        additionallayers: additionalLayersReducer
    },
    epics: mapEpics
});
