// http://www.jslint.com/
// http://www.jshint.com/, also available as Eclipse or Sublime plugin
// Strict mode is safer to develop in, ya?
"use strict";


var visWidth = $(document).width()-50,
    visHeight = $(document).height()-50;
var forceLayout = undefined;

var vis = d3.select("#chart").append("svg:svg")
.attr("id", "graphSvg")
    .attr("width", visWidth)
    .attr("height", visHeight)
	.attr("pointer-events", "all")
//  .append('svg:g')
    .call(d3.behavior.zoom().on("zoom", redraw))
//  .append('svg:g')
  ;

vis.append('svg:rect')
	.attr("id", "graphRect")
    .attr('width', visWidth)
    .attr('height', visHeight)
    .attr('fill', 'AliceBlue');

var resizedWindow = function()
{	
	visWidth = $(document).width()-50;
    visHeight = $(document).height()-50;
	
    if(forceLayout){
    	forceLayout.size([visWidth, visHeight]);
    }
    
    d3.select("#graphSvg")
    .attr("width", visWidth)
    .attr("height", visHeight);

	d3.select("#graphRect")
    .attr('width', visWidth)
    .attr('height', visHeight);
};

$(window).resize(resizedWindow);

resizedWindow();

function redraw() {
  console.log("redrawing D3", d3.event.translate, d3.event.scale);
  vis.attr("transform",
      "translate(" + d3.event.translate + ")"
      + " scale(" + d3.event.scale + ")");
}


// TODO
/*
 * When adding data dynamically, one guy had success using d3.layout.tree().nodes(nodes) where
 * nodes contains {source: new_node, target: new_node.parent}. Something similar should work for us.
 */

// TODO Cutting initAndPopulateGraph into two methods
// Then cutting pipulateGraph into being an incremental method

d3.json("force_files/set_data.json", initAndPopulateGraph);
//d3.json("force_files/set_data.json", initAndPopulateGraphOriginal);



/* json format for graph is/was:
{
	"nodes": [
	    {
	      "name": "Cell Behavior Ontology",
	      "number": 6
	    },
	    {
	      "name": "Drosophila development",
	      "number": 132
	    }
    ],
    "links": [
	    {
	      "source": 0,
	      "target": 18,
	      "value": 2,
	      "sourceMappings": 1
	    },
	    {
	      "source": 0,
	      "target": 2,
	      "value": 2,
	      "sourceMappings": 1
	    }
    ]
}
*/

var ontologyNeighbourhoodJsonForGraph = new Object();
ontologyNeighbourhoodJsonForGraph.nodes = [];
ontologyNeighbourhoodJsonForGraph.links = [];


function fetchOntologyNeighbourhood(centralOntologyVirtualId){
	// TODO XXX Do this in the same sort of way that it occurs in BioMixer.
	// I expect this to be very much faster.
	// Then try adding web workers around things to see if it affects it further.
	
	// TODO XXX I lose all the error handling and retry handling that I set up in BioMixer.
	// This is our first loss, that we have to futz with that again. It can be recreated, or if this
	// is fasts enough, we can adapt things so that some of the Java work in BioMixer can be used here too
	// I mostly need to bypass the overall architecture of BioMixer to see how it affects loading speed
	// and responsivity, as well as to try using web workers (which don't work with GWT 2.5 right now)
	
	/* Adding BioPortal data for ontology overview graph (mapping neighbourhood of a single ontology node)
	1) Get the mapped ontology ids from the target ontology id [starts at line 126 in OntologyMappingNeighbourhood]
	   http://bioportal.bioontology.org/ajax/jsonp?apikey=6700f7bc-5209-43b6-95da-44336cbc0a3a&userapikey=&path=%2Fvirtual%2Fmappings%2Fstats%2Fontologies%2F1033&callback=__gwt_jsonp__.P0.onSuccess
	   - can create nodes and links with sparse meta-data now if we want, or we can wait for more data
	2) Get ontology details, which is one big json return [passed to line 167 for class OntologyMappingNeighbourhoodLoader nested class OntologyDetailsCallback]
	   http://bioportal.bioontology.org/ajax/jsonp?apikey=6700f7bc-5209-43b6-95da-44336cbc0a3a&userapikey=&path=%2Fontologies%2F&callback=__gwt_jsonp__.P1.onSuccess
	   - fill in nodes with details from this data
	3) Get ontology metrics for each ontology [line 82 in AutomaticOntologyExpander]
	   - set node size (# of concepts), and tool tip properties of classes, individuals, properties, and notes
	   http://bioportal.bioontology.org/ajax/jsonp?apikey=6700f7bc-5209-43b6-95da-44336cbc0a3a&userapikey=&path=%2Fontologies%2Fmetrics%2F45254&callback=__gwt_jsonp__.P7.onSuccess
	*/
	
	// 1) Get mappings to central ontology
	var ontologyMappingUrl = buildOntologyMappingUrl(centralOntologyVirtualId);
	var ontologyMappingCallback = new OntologyMappingCallback(ontologyMappingUrl, centralOntologyVirtualId);
//	var fetcher = new RetryingJsonpFetcher(ontologyMappingCallback);
//	fetcher.retryFetch();
	var fetcher = closureRetryingJsonpFetcher(ontologyMappingCallback);
	fetcher();
}

function OntologyMappingCallback(url, centralOntologyVirtualId){
	this.url = url;
	var centralOntologyVirtualId = centralOntologyVirtualId;
	// Define this fetcher when one is instantiated (circular dependency)
	this.fetcher = undefined;
	var self = this;
	
	this.callback = function (mappingData, textStatus, jqXHR){
		// textStatus and jqXHR will be undefined, because JSONP and cross domain GET don't use XHR.

//		var errorOrRetry = self.fetcher.retryFetch(mappingData);
		var errorOrRetry = self.fetcher(mappingData);
		if(0 == errorOrRetry){
			return;
		} else if(-1 == errorOrRetry){
			// have an error. Done?
			return;
		}
		
		var defaultNumOfTermsForSize = 100;

		// Create the central node
		var centralOntologyNode = new Object();
		centralOntologyNode.name = "blank";
		centralOntologyNode.weight = 1;
		centralOntologyNode.number = defaultNumOfTermsForSize; // number of terms
		centralOntologyNode.virtualId = centralOntologyVirtualId;
		ontologyNeighbourhoodJsonForGraph.nodes.push(centralOntologyNode);
		
		var virtualIdNodeMap = new Object();
		$(virtualIdNodeMap).attr("vid"+centralOntologyVirtualId, centralOntologyNode);
		
		// TODO XXX Either the parsing or the looping here causes a visible glitch in rendering,
		// so this is the first place to try a web worker out.

		// Make some graph parts!
		$.each(mappingData.success.data[0].list[0].ontologyMappingStatistics,
			function(index, element){
				var virtualId = element.ontologyId;

				if(typeof virtualId === "undefined"){
					console.log("Undefined virtual id");
				}
				
				// Create the neighbouring nodes
				var ontologyNode = new Object();
				ontologyNode.name = "blank";
				ontologyNode.weight = 1;
				ontologyNode.number = defaultNumOfTermsForSize; // number of terms
				ontologyNode.virtualId = virtualId;
				var targetIndex = ontologyNeighbourhoodJsonForGraph.nodes.push(ontologyNode) - 1;
				// TODO I feel like JS doesn't allow references like this...
				$(virtualIdNodeMap).attr("vid"+virtualId, ontologyNode);
				
				// Make the links at the same time; they are done now!
				var ontologyLink = new Object();
				ontologyLink.source = centralOntologyNode;
				ontologyLink.target = ontologyNode;
				ontologyLink.value = element.totalMappings; // This gets used for link stroke thickness later.
				ontologyLink.sourceMappings = element.sourceMappings;
				ontologyLink.targetMappings = element.targetMappings;
				ontologyNeighbourhoodJsonForGraph.links.push(ontologyLink);
			}
		);

		// Not sure about whether to do this here or not...
		console.log("ontologyMappingCallback");
		populateGraph(ontologyNeighbourhoodJsonForGraph, true);

		//----------------------------------------------------------
		
		// 2) Get details for all the ontologies (and either create or update the nodes)
		var ontologyDetailsUrl = buildOntologyDetailsUrl();
		var ontologyDetailsCallback = new OntologyDetailsCallback(ontologyDetailsUrl, virtualIdNodeMap);
//		var fetcher = new RetryingJsonpFetcher(ontologyDetailsCallback);
//		fetcher.retryFetch();
		var fetcher = closureRetryingJsonpFetcher(ontologyDetailsCallback);
		fetcher();
	}
	
}

function OntologyDetailsCallback(url, virtualIdNodeMap){
	this.url = url;
	// Define this fetcher when one is instantiated (circular dependency)
	this.fetcher = undefined;
	// Need to fetch existing node objects from this
	this.virtualIdNodeMap = virtualIdNodeMap;
	var self = this;

	this.callback  = function ontologyDetailsCallback(detailsDataRaw, textStatus, jqXHR){
		// textStatus and jqXHR will be undefined, because JSONP and cross domain GET don't use XHR.

//		var errorOrRetry = self.fetcher.retryFetch(detailsDataRaw);
		var errorOrRetry = self.fetcher(detailsDataRaw);
		if(0 == errorOrRetry){
			return;
		} else if(-1 == errorOrRetry){
			// have an error. Done?
			return;
		}
		
		// Loop over ontologies and add their additional properties to the nodes
		// Recall that getting *all* ontology details is the easiest (only) way,
		// so we have to skip anything that is not defined.
		$.each(detailsDataRaw.success.data[0].list[0].ontologyBean,
				function(index, ontologyDetails){
					// I can't cherry pick, because this involves iterating
					// through the entire set of ontologies to find each ontology entry.
					// So, I will do a separate loop, and only use data for which there
					// exists in the graph a corresponding ontology.
					// Make use of details to add info to ontologies
					var virtualOntologyId = ontologyDetails.ontologyId;
					// var node = ontologyNeighbourhoodJsonForGraph.;
					var node = $(self.virtualIdNodeMap).attr("vid"+virtualOntologyId);
					
					if(typeof node === "undefined"){
						// Skip node details that aren't in our graph
						return;
					}
					
					node.name = ontologyDetails.displayLabel;
					node.ONTOLOGY_VERSION_ID = ontologyDetails.id;
					node.ONTOLOGY_ABBREVIATION = ontologyDetails.abbreviation;
					node.VIRTUAL_ONTOLOGY_ID = virtualOntologyId
					node.LABEL = ontologyDetails.displayLabel;
					node.DESCRIPTION = ontologyDetails.description;
					node.VIEWING_RESTRICTIONS = ontologyDetails.viewingRestrictions; // might be missing
					
					// --------------------------------------------------------------
					// Do this in the details callback, then? Do we need anything from details in
					// order to get metrics? Do we need the ontology id?
					// 3) Get metric details for each ontology
					var ontologyMetricsUrl = buildOntologyMetricsUrl(node.ONTOLOGY_VERSION_ID);
					var ontologyMetricsCallback = new OntologyMetricsCallback(ontologyMetricsUrl, node);
//					var fetcher = new RetryingJsonpFetcher(ontologyMetricsCallback);
//					fetcher.retryFetch();
					var fetcher = closureRetryingJsonpFetcher(ontologyMetricsCallback);
					fetcher();
					
				}
		);

		console.log("ontologyDetailsCallback");
		updateNodesAndLinks({nodes:ontologyNeighbourhoodJsonForGraph.nodes, links:[]});
			
	}
}

function OntologyMetricsCallback(url, node){
	this.url = url;
	this.node = node;
	// Define this fetcher when one is instantiated (circular dependency)
	this.fetcher = undefined;
	var self = this;
	
	this.callback = function (metricDataRaw, textStatus, jqXHR){
		// textStatus and jqXHR will be undefined, because JSONP and cross domain GET don't use XHR.
		
//		var errorOrRetry = 	self.fetcher.retryFetch(metricDataRaw);
		var errorOrRetry = 	self.fetcher(metricDataRaw);
		if(0 == errorOrRetry){
			return;
		} else if(-1 == errorOrRetry){
			// have an error. Done?
			return;
		}
		
		var metricData = metricDataRaw.success.data[0].ontologyMetricsBean;
		
		var nodeSizeBasis = 100;
		var numClasses=0, numIndividuals=0, numProperties=0;
	    if (typeof metricData !== "undefined") {
	        if (metricData.numberOfClasses != null) {
	            numClasses = metricData.numberOfClasses;
	            nodeSizeBasis = numClasses;
	        }
	        if (metricData.numberOfIndividuals != null) {
	            numIndividuals = metricData.numberOfIndividuals;
	        }
	        if (metricData.numberOfProperties != null) {
	            numProperties = metricData.numberOfProperties;
	        }
	    }
	    
		self.node.weight = 1;
		self.node.numberOfClasses = numClasses;
		self.node.numberOfIndividuals = numIndividuals;
		self.node.numberOfProperties = numProperties;
		// TODO XXX This is what the node size was derived from
		// Add a transformer for this (I believe in D3 this should be easy)
		// I can use the transformation algorithm from BioMixer.
		self.node.number = nodeSizeBasis;
		
		console.log("ontologyMetricsCallback");
		updateNodesAndLinks({nodes:[self.node], links:[]});
	}
}


function buildOntologyMappingUrl(centralOntologyVirtualId){
	return "http://bioportal.bioontology.org/ajax/jsonp?apikey=6700f7bc-5209-43b6-95da-44336cbc0a3a&userapikey=&path=%2Fvirtual%2Fmappings%2Fstats%2Fontologies%2F"+centralOntologyVirtualId+"&callback=?";
}

function buildOntologyDetailsUrl(){
	return "http://bioportal.bioontology.org/ajax/jsonp?apikey=6700f7bc-5209-43b6-95da-44336cbc0a3a&userapikey=&path=%2Fontologies%2F"+"&callback=?";
}

function buildOntologyMetricsUrl(ontologyVersionId){
	return "http://bioportal.bioontology.org/ajax/jsonp?apikey=6700f7bc-5209-43b6-95da-44336cbc0a3a&userapikey=&path=%2Fontologies%2Fmetrics%2F"+ontologyVersionId+"&callback=?";
}

//function RetryingJsonpFetcher(callbackObject){
//	this.callbackObject = callbackObject;
//	// Has circular dependency with the callback
//	this.callbackObject.fetcher = this;
//	this.previousRetriesMade = 0;
//	var self = this;
//
//		/*
//		 * Return values: -1 is non-retry due to error, 0 is retry, 1 is success, no error.
//		 */
//		RetryingJsonpFetcher.prototype.retryFetch = function(resultData){
//			// console.log("retryFetch for "+self.callbackObject.url);
//			if(typeof resultData === "undefined"){
//				// If not error, call for first time
//				jQuery.getJSON(self.callbackObject.url, null, self.callbackObject.callback);
//				return 0;
//			}
//			
//			if(typeof resultData.success === "undefined") {
//				if(resultData.status == "403" && resultData.body.indexOf("Forbidden") >= 0){
//					console.log("No retry, Forbidden Error: "+self.callbackObject.url);
//					console.log("No retry, Forbidden Error: "+resultData.body);
//		    		return -1;
//				} else if(resultData.status == "500" || resultData.status == "403"){
//		    		if(self.previousRetriesMade < 4){
//		    			self.previousRetriesMade++;
//		    			jQuery.getJSON(self.callbackObject.url, null, self.callbackObject.callback);
//		    			return 0;
//		    		} else {
//			    		// Error, but we are done retrying.
//			    		console.log("No retry, Error: "+resultData);
//			    		return -1;
//		    		}
//		    	} else {
//			    	// Don't retry for other errors
//		    		console.log("Error: "+self.callbackObject.url+" --> Data: "+resultData.status);
//			    	return -1;
//		    	}
//		    } else {
//		    	// Success, great!
//		    	return 1;
//		    }
//		}
//}

function closureRetryingJsonpFetcher(callbackObject){
	var callbackObject = callbackObject;
	// Has circular dependency with the callback
	var previousRetriesMade = 0;

	/*
	 * Return values: -1 is non-retry due to error, 0 is retry, 1 is success, no error.
	 */
	callbackObject.fetcher = function(resultData){
			// console.log("retryFetch for "+callbackObject.url);
			if(typeof resultData === "undefined"){
				// If not error, call for first time
				jQuery.getJSON(callbackObject.url, null, callbackObject.callback);
				return 0;
			}
			
			if(typeof resultData.success === "undefined") {
				if(resultData.status == "403" && resultData.body.indexOf("Forbidden") >= 0){
					console.log("Forbidden Error, no retry: "
							+"\nURL: "+callbackObject.url
							+"\nReply: "+resultData.body);
		    		return -1;
				} else if(resultData.status == "500" || resultData.status == "403"){
		    		if(previousRetriesMade < 4){
		    			previousRetriesMade++;
		    			console.log("Retrying: "+callbackObject.url);
		    			jQuery.getJSON(callbackObject.url, null, callbackObject.callback);
		    			return 0;
		    		} else {
			    		// Error, but we are done retrying.
			    		console.log("No retry, Error: "+resultData);
			    		return -1;
		    		}
		    	} else {
			    	// Don't retry for other errors
		    		console.log("Error: "+callbackObject.url+" --> Data: "+resultData.status);
			    	return -1;
		    	}
		    } else {
		    	// Success, great!
		    	return 1;
		    }
		}
	
	return callbackObject.fetcher;
}

function initAndPopulateGraph(json){
	initGraph();
	
	var centralOntologyVirtualId = 1033;
	
	// Will do async stuff and add to graph
	fetchOntologyNeighbourhood(centralOntologyVirtualId);
	
//	console.log(json);
//	populateGraph("");
//	populateGraph(json);
//	populateGraph("");
//	populateGraph(json);
}

function initGraph(){
	forceLayout = self.forceLayout = d3.layout.force();
	
	forceLayout
	.gravity(.05)
    .distance(600)
    .charge(-100)
    .size([visWidth, visHeight])
    .start();
}

/**
* This function should be used when adding brand new nodes and links to the
* graph. Do not call it to update properties of graph elements.
* TODO Make this function cleaner and fully compliant with the above description!
*/
function populateGraph(json, newElementsExpected){
//	console.log("Populating with:");
//	console.log(json);
	
	if(json === "undefined" || json.length == 0 || json.nodes.length == 0 && json.links.length == 0){
		// console.log("skip");
		// return;
		newElementsExpected = false;
	}
	
	// Data constancy via key function() passed to data()
	// Link stuff first
	var links = vis.selectAll("line.link").data(json.links, function(d){return d.source.virtualId+"->"+d.target.virtualId});
	// console.log("Before append links: "+links[0].length+" links.enter(): "+links.enter()[0].length+" links.exit(): "+links.exit()[0].length+" links from selectAll: "+vis.selectAll("line.link")[0].length);

	// Add new stuff
	if(newElementsExpected === true)
	links.enter().append("svg:line")
	.attr("class", "link") // Make svg:g like nodes if we need labels
	.attr("id", function(d){ return "link_line_"+d.source.virtualId+"->"+d.target.virtualId})
	.on("mouseover", highlightLink())
		.on("mouseout", changeColourBack("#496BB0", "#999"));
	
	// console.log("After append links: "+links[0].length+" links.enter(): "+links.enter()[0].length+" links.exit(): "+links.exit()[0].length+" links from selectAll: "+vis.selectAll("line.link")[0].length);
	
	// Update Basic properties
//	if(newElementsExpected === true)
	links
    .attr("class", "link")
    .attr("x1", function(d) { return d.source.x; })
    .attr("y1", function(d) { return d.source.y; })
    .attr("x2", function(d) { return d.target.x; })
    .attr("y2", function(d) { return d.target.y; })
	.style("stroke-width", function(d) { return Math.sqrt(Math.ceil(d.value/10)); });

	// Update Tool tip
	if(newElementsExpected === true)
	links.append("title") // How would I *update* this if I needed to?
		.text(function(d) { return "Number Of Mappings: "+d.sourceMappings; })
			.attr("id", function(d){ return "link_title_"+d.source.virtualId+"->"+d.target.virtualId});

	// Node stuff now
	
	var nodes = vis.selectAll("g.node").data(json.nodes, function(d){return d.virtualId});
	// console.log("Before append nodes: "+nodes[0].length+" nodes.enter(): "+nodes.enter()[0].length+" nodes.exit(): "+nodes.exit()[0].length+" Nodes from selectAll: "+vis.selectAll("g.node")[0].length);
	// Add new stuff
	if(newElementsExpected === true)
	nodes.enter().append("svg:g")
	.attr("class", "node")
	.attr("id", function(d){ return "node_g_"+d.virtualId})
	// Is it ok to do call() here?
    .call(forceLayout.drag);
	
	// console.log("After append nodes: "+nodes[0].length+" nodes.enter(): "+nodes.enter()[0].length+" nodes.exit(): "+nodes.exit()[0].length+" Nodes from selectAll: "+vis.selectAll("g.node")[0].length);
	
	// Easiest to use JQuery to get at existing enter() circles
	// Otherwise we futz with things like the enter()select(function) below
//	 var existingEnterCircles = nodes.enter().select(function(d){return $(this).select(".circle")});
//	var existingEnterNodes = nodes.enter().select(function(d){return d3.select(this)});
//	var existingEnterCircles = $(nodes).select(".circle");
//	console.log("Found circles: "+existingEnterNodes[0].length);
	
	// TODO Trying to append only when necessary, but then trying to use the enter selection to sub-select
	// the previously appended elements...
	
    // XXX TODO I think that the lack of way to grab child elements from the enter() selection while they are
	// data bound (as is usual for most D3 selections), is what is preventing me from udpating using D3
	// idioms. THEREFORE I NEED TO UPDATE USING JQUERY SELECTIONS, ON UNIQUE ELEMENT IDS OR CLASSES. This means no D3 implicit selection loops.
	
	// I know that append() is truly new things...how do I grab enter() that are not new things
	// (because they have been previously appended)?
	// Trying to select all circles that are entering a second or third time or more...
	// Without using append, which would append additional circles to the entering data which already has a circle...
	// Basic properties
	if(newElementsExpected === true) // How would I *update* this if I needed to?
	nodes
	.append("svg:circle") 
	.attr("id", function(d){ return "node_circle_"+d.virtualId})
    .attr("class", "circle")
    .attr("cx", "0px")
    .attr("cy", "0px")
	.style("fill", "#496BB0")
	.attr("data-radius_basis", function(d) { return d.number;})
    .attr("r", function(d) { return ontologyNodeScalingFunc(d.number); })
	.on("mouseover", changeColour("#FC6854", "#ff1", "#ff1", .1))
	.on("mouseout", changeColourBack("#496BB0", "#999"));
		
	// Tool tip
	if(newElementsExpected === true)  // How would I *update* this if I needed to?
	nodes.append("title")
	  .attr("id", function(d){ return "node_title_"+d.virtualId})
	  .text(function(d) { return "Number Of Terms: "+d.number; });
	
	// Label
	if(newElementsExpected === true) // How would I *update* this if I needed to?
	nodes.append("svg:text")
		.attr("id", function(d){ return "node_text_"+d.virtualId})
	    .attr("class", "nodetext")
	    .attr("dx", 12)
	    .attr("dy", 1)
	    .text(function(d) { return d.name; });
		
	// Would do exit().remove() here if it weren't re-entrant, so to speak.
	

	
	// XXX Doing this a second time destroys the visualization!
	// How would we do it on only new things?
	// Oh! It is because we are using the links and nodes references,
	// and losing references to the existing nodes and links.
	// I really want to make sure I keep trakc of whether we
	// have all nodes/links, or just new ones...
	if(newElementsExpected === true){
		forceLayout.on("tick", function() {
			// For every iteration of the layout (until it stabilizes)
			links
			  .attr("x1", function(d) { return d.source.x; })
		      .attr("y1", function(d) { return d.source.y; })
		      .attr("x2", function(d) { return d.target.x; })
		      .attr("y2", function(d) { return d.target.y; });
		
			nodes.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
		});
	}
	
	
	// Whenever I call populate, it adds more to this layout.
	// I need to figure out how to get enter/update/exit sort of things
	// to work for the layout.
	if(newElementsExpected === true){
		// forceLayout
		// .nodes(nodes.enter())
	    // .links(links.enter());
		forceLayout
		.nodes(json.nodes)
	    .links(json.links);
		// Call start() whenever any nodes or links get added or removed
		forceLayout.start();
	}
	
	// Don't have sizes here, but still...
	updateNodeScalingFactor();
	
}

/**
 * We cannot update the graph with new node or link properties *efficiently* using D3.
 * This is because, although you can use the enter() selection, you cannot sub-select within
 * it to access the children DOM elements, and using other D3 ways of getting at the elements
 * fails to have them bound to the data as they are in the enter() selection [meaning that
 * data based property settings fail].
 * 
 * Explicit looping allows us to cherry pick data, and do fewer DOM changes than I could
 * when using D3's data().enter() selection results.
 * 
 * @param json
 */
function updateNodesAndLinks(json){
	// console.log("Updating with data:");
	// console.log(json);
	
	var updateLinksFromJson = function(i, d){
		// Given a json encoded graph element, update all of the nested elements associated with it
		// cherry pick elements that we might otherwise get by class "link"
		// TODO Do I still need to do data() on this looped-over element?? I think perhaps!
		// If so, I can do that prior to using these loops to cherry pick elements.
		console.log("Updating with link:"+d);
		console.log("#link_line_"+d.source.virtualId+"->"+d.target.virtualId);
		var link = vis.select("#link_line_"+d.source.virtualId+"->"+d.target.virtualId);
		link.style("stroke-width", function(d) { return Math.sqrt(Math.ceil(d.value/10)); });
		link.select("title").text(function(d) { return "Number Of Mappings: "+d.sourceMappings; });
	}
	
	var updateNodesFromJson = function(i, d){
		// Given a json encoded graph element, update all of the nested elements associated with it
		// cherry pick elements that we might otherwise get by class "node"
		console.log("Updating "+"#node_g_"+d.virtualId);
		var node = vis.select("#node_g_"+d.virtualId);
		console.log("Updating "+node.attr("class"));
//		node.select("circle").attr("r", function(d) { return ontologyNodeScalingFunc(d.number); });
		node.select("circle").attr("data-radius_basis", d.number);
		node.select("title").text(function(d) { return "Number Of Terms: "+d.number; });
		node.select("text").text(function(d) { return d.name; });
	}
	
	$.each(json.links, updateLinksFromJson);
	$.each(json.nodes, updateNodesFromJson);

//	console.log("Use a timer of some sort, to prevent over-use.");
	
	if(nodeUpdateTimer == false){
		nodeUpdateTimer = true;
		window.setTimeout(function(){ console.log("TIMER RESET"); nodeUpdateTimer = false; updateNodeScalingFactor(); }, 1000);
	}
}
var nodeUpdateTimer = false;

//function initAndPopulateGraphOriginal(json){
//	    forceLayout = self.forceLayout = d3.layout.force()
//	        .nodes(json.nodes)
//	        .links(json.links)
//	        .gravity(.05)
//	        .distance(600)
//	        .charge(-100)
//	        .size([visWidth, visHeight])
//	        .start();
//
//	    var link = vis.selectAll("line.link")
//	        .data(json.links)
//	      .enter().append("svg:line")
//	        .attr("class", "link")
//	        .attr("x1", function(d) { return d.source.x; })
//	        .attr("y1", function(d) { return d.source.y; })
//	        .attr("x2", function(d) { return d.target.x; })
//	        .attr("y2", function(d) { return d.target.y; })
//			.style("stroke-width", function(d) { return Math.sqrt(Math.ceil(d.value/10)); });
//			
//		link.append("title")
//			.text(function(d) { return "Number Of Mappings: "+d.sourceMappings; });
//			
//		link.on("mouseover", highlightLink())
//			.on("mouseout", changeColourBack("#496BB0", "#999"));
//			
//	    var node = vis.selectAll("g.node")
//	        .data(json.nodes)
//	      .enter().append("svg:g")
//	        .attr("class", "node")
//	        .call(forceLayout.drag);
//
//	    node.append("svg:circle")
//	        .attr("class", "circle")
//	        .attr("cx", "0px")
//	        .attr("cy", "0px")
//			.style("fill", "#496BB0")
//	        .attr("r", function(d) { return Math.sqrt((d.number)/10); })
//			.on("mouseover", changeColour("#FC6854", "#ff1", "#ff1", .1))
//			.on("mouseout", changeColourBack("#496BB0", "#999"));
//			
//		node.append("title")
//	      .text(function(d) { return "Number Of Terms: "+d.number; });
//
//	    node.append("svg:text")
//	        .attr("class", "nodetext")
//	        .attr("dx", 12)
//	        .attr("dy", 1)
//	        .text(function(d) { return d.name; });
//			
//		node.append("svg:text")
//	        .attr("class", "nodetext")
//	        .attr("x", 12)
//	        .attr("y", 1)
//	        .text(function(d) { return d.name; });
//
//		forceLayout.on("tick", function() {
//	    	// For every iteration of the layout (until it stabilizes)
//	      link.attr("x1", function(d) { return d.source.x; })
//	          .attr("y1", function(d) { return d.source.y; })
//	          .attr("x2", function(d) { return d.target.x; })
//	          .attr("y2", function(d) { return d.target.y; });
//
//	      node.attr("transform", function(d) { return "translate(" + d.x + "," + d.y + ")"; });
//	    });
//}



function highlightLink(){
	return function(d, i){
	
		var xSourcePos = d.source.x;
		var ySourcePos = d.source.y;
		var xTargetPos = d.target.x;
		var yTargetPos = d.target.y;
		
		d3.selectAll("text").style("opacity", .2)
			.filter(function(g, i){return g.x==d.source.x||g.y==d.source.y||g.x==d.target.x||g.y==d.target.y;})
			.style("opacity", 1);
			
		d3.selectAll("line").style("stroke-opacity", .1);
		d3.selectAll("circle").style("fill-opacity", .1)
			.style("stroke-opacity", .2)
			.filter(function(g, i){return g.x==d.source.x||g.y==d.source.y||g.x==d.target.x||g.y==d.target.y})
			.style("fill-opacity", 1)
			.style("stroke-opacity", 1);
		d3.select(this).style("stroke-opacity", 1)
			.style("stroke", "#3d3d3d");
			
		
	}
}

function changeColour(circleFill, lineFill, circlesFill, opacity){
	return function(d, i){
		
		var xPos=d.x;
		var yPos=d.y;
		
		d3.selectAll("line").style("stroke-opacity", .1);
		d3.selectAll("circle").style("fill-opacity", .1)
			.style("stroke-opacity", .2);
			
		d3.selectAll("text").style("opacity", .2)
			.filter(function(g, i){return g.x==d.x})
			.style("opacity", 1);
		
		var sourceNode = d3.select(this).style("fill", circleFill)
			.style("fill-opacity", 1)
			.style("stroke-opacity", 1);
			
		var adjacentLinks = d3.selectAll("line")
			.filter(function(d, i) {return d.source.x==xPos && d.source.y==yPos;})
			.style("stroke-opacity", 1)
			.style("stroke", "#3d3d3d")
			.each(function(d){
				d3.selectAll("circle")
				.filter(function(g, i){return d.target.x==g.x && d.target.y==g.y;})
				.style("fill-opacity", 1)
				.style("stroke-opacity", 1)
				.each(function(d){
					d3.selectAll("text")
					.filter(function(g, i){return g.x==d.x})
					.style("opacity", 1);});
		});
	};
}

function changeColourBack(circleFill, lineFill){
	return function(d, i){
		d3.selectAll("circle")
			.style("fill", circleFill)
			.style("fill-opacity", .75)
			.style("stroke-opacity", 1);
		d3.selectAll("line")
			.style("stroke", lineFill)
			.style("stroke-opacity", .75);
		d3.selectAll("text").style("opacity", 1);
	};
}


// XXX TODO
// I think that the node and arc relative size feature should happen with a timer
// instead of on every size change occurrence, and furthermore, that is should
// occur in a web worker with a dedicated update function for only size changes.
// But first, I will try implementing simply by modifying the function for "r"...
// which can't really work, because that gets evaluated only when set...
// BioMixer used a 500 ms delay on re-doing things.

// 20 * 7 seems too big. Got 20 from other transformers.
var MAX_ON_SCREEN_SIZE = 20 * 5;
var MIN_ON_SCREEN_SIZE = 3;
var REFRESH_LOOP_DELAY_MS = 500;
//var ontologyNodeAreaScalingFactor = 1.0;
var minRawSize = -1;
var maxRawSize = -1;
function updateNodeScalingFactor(){
	// Call this prior to redrawing. The alternative is to track on every size
	// modification. That worked well for BioMixer, but perhaps we're better
	// off doing a bulk computation per size-refreshing redraw that we want to make.
	$.each(vis.selectAll("g.node").select("circle")[0], function(i, circle){
		circle = $(circle);
//		console.log("Updating circle max min "+circle.attr("data-radius_basis"));
//		console.log(circle);
		if(-1 == maxRawSize || circle.attr("data-radius_basis") > maxRawSize){
			maxRawSize = circle.attr("data-radius_basis");
		}
		if(-1 == minRawSize || circle.attr("data-radius_basis") < minRawSize){
			minRawSize = circle.attr("data-radius_basis");
		}
	});
	
//	vis.selectAll("g.node").data().select("circle").attr("r", function(d) { console.log("d.data-radius_basis is "+d.data-radius_basis); return ontologyNodeScalingFunc(d.number); });
	
	$.each(vis.selectAll("g.node")[0], function(i, node){
		// Given a json encoded graph element, update all of the nested elements associated with it
		// cherry pick elements that we might otherwise get by class "node"
//		console.log("Updating circle radius"+$(node).children("circle").attr("id"));
//		console.log(node);
		var circle = $(node).children("circle");
//		console.log(circle);
		circle.attr("r", function(d) { return ontologyNodeScalingFunc(circle.attr("data-radius_basis")); });
	});
}

function ontologyNodeScalingFunc(rawValue){
	// return Math.sqrt((rawValue)/10);
	
	if(maxRawSize == minRawSize){
		return rawValue;
	}
	
	// computeFactorOfRange from BioMixer
	var factor = 1.0 - (maxRawSize - rawValue) / Math.max(1, maxRawSize - minRawSize);
	// TODO This is makign some big nodes at certain times. Firm up the logic.
	console.log("Factor is "+factor);

	// linearAreaRelativeScaledRangeValue
    var linearArea = Math.PI * Math.pow(MIN_ON_SCREEN_SIZE, 2) + factor
            * Math.PI * Math.pow(MAX_ON_SCREEN_SIZE, 2);
    var diameter = Math.sqrt(linearArea / Math.PI);
    return diameter/2; // need radius for SVG
}

/*
    private double linearFunction(double value) {
        // Ha! A sqrt makes this not linear. Mis-named now...
        return 2 * (4 + Math.sqrt((value) / 10));
    }

    private double logFunction(double value) {
        return 4 + Math.log(value) * 10;
    }
 */


//public class OntologyGraphMappingArcSizeTransformer extends ArcSizeTransformer {
//
//    private HashMap<Double, Double> discreteRawSizeToRenderSizeMap = new HashMap<Double, Double>();
//
//    {
//        discreteRawSizeToRenderSizeMap.put(0.0, 1.0);
//        discreteRawSizeToRenderSizeMap.put(200.0, 2.0);
//        discreteRawSizeToRenderSizeMap.put(400.0, 3.0);
//        discreteRawSizeToRenderSizeMap.put(2000.0, 4.0);
//        discreteRawSizeToRenderSizeMap.put(4000.0, 5.0);
//        discreteRawSizeToRenderSizeMap.put(20000.0, 7.0);
//        discreteRawSizeToRenderSizeMap.put(40000.0, 10.0);
//    } 
//
//    @Override
//    public Double transform(Double value) throws Exception {
//        // return logFunction(value);
//        // return linearFunction(value);
//        // return discretizingFunction(value);
//        return scaleForContextRange(value);
//
//    }
//
//    private Double linearFunction(Double value) {
//        // return 2 * (4 + Math.sqrt((value) / 10));
//        return (1 + Math.sqrt((value)));
//    }
//
//    private Double logFunction(Double value) {
//        return 4 + Math.log(value) * 10;
//    }
//
//    private Double discretizingFunction(Double value) {
//        double renderSize = 0;
//        for (Double lowerCutOff : discreteRawSizeToRenderSizeMap.keySet()) {
//            double cutOffRenderSize = discreteRawSizeToRenderSizeMap
//                    .get(lowerCutOff);
//            // If we're above a given cutoff and it's also the biggest one
//            // yet...
//            if (lowerCutOff < value && renderSize < cutOffRenderSize) {
//                renderSize = cutOffRenderSize;
//            }
//        }
//        return renderSize;
//    }
//}

