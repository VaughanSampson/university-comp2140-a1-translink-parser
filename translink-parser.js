import promptSync from 'prompt-sync'; 
import fs from "fs";
import {parse} from "csv-parse";

// Begins the program.
mainLoop();

/**
 * The recursive loop which is called to start and run the program recursively.
 * @param {object} preLoadedUqStopsData - UQ stops data which has already been 
 * loaded in by a previous recursion.
 */
async function mainLoop(preLoadedUqStopsData = null) {

  // Get static stops data.
  const uqStopsData = preLoadedUqStopsData ?? await loadUQStopsData();  

  console.log("Welcome to the UQ Lakes station bus tracker!");
  const prompt = promptSync();

  // Get valid user input to filter results.
  const inputDate = getValidatedDateInput(prompt);
  const inputTime = getValidatedTimeInput(prompt);
  const inputRoute = getValidatedRouteInput(prompt, uqStopsData);

  // Get active services which run on inputted date.
  const activeServices = await getActiveServicesOnDate(inputDate);

  // Filter static data on active services.
  let filteredData = await filterDataByActiveServices(uqStopsData, activeServices);
  // Filter joined data on time.
  filteredData = await filterDataByTime(filteredData, inputTime, 10);
  // Filter joined data on route.
  filteredData = await filterDataByShortRouteName(filteredData, inputRoute);

  // Join static data with live data.
  filteredData = await joinLiveTripsToData(filteredData);
  filteredData = await joinLivePositionToData(filteredData);

  // Order final data for table.
  const displayData = filteredData.map( data => {
    return{
      "Route Short Name": data.route_short_name,
      "Route Long Name" : data.route_long_name,
      "Service ID" : data.service_id,
      "Heading Sign" : data.trip_headsign,
      "Scheduled Arrival Time" : data.arrival_time,
      "Live Arrival Time" : data.live_arrival_time,
      "Live Position" : data.position
    }
  });

  console.table(displayData);
  
  // Checks if the user wants to search again, otherwise ends program.
  if(getSearchAgainInput(prompt)) {
    mainLoop(uqStopsData);
  }
  else {
    console.log("Thanks for using the UQ Lakes station bus tracker!");
  }
}

/**
 * Gets and then joins stop time data for UQ Lakes station.
 * @returns {object} Object with accumulated stop time results.
 */
async function loadUQStopsData() {

  // Get all UQLakes station stopIDs from stop.txt.
  const stopIDs = (await parseLocalCSVToJSON("./static-data/stops.txt"))
  .filter(item => item[9] == "place_uqlksa")
  .map(item => item[0]);

  // Get stop times from stop_times.txt, filtered by stopID.
  const stopTimes = await getStopTimesFromStopIDs(stopIDs);

  // Get trips data from trips.txt.
  const trips = (await parseLocalCSVToJSON("./static-data/trips.txt"))
  .map(item => {return {
    route_id : item[0],
    service_id : item[1],
    trip_id : item[2],
    trip_headsign : item[3]
  }});

  let joinedData = await joinObjectsOnField("inner", "trip_id", stopTimes, trips, ['route_id','service_id','trip_headsign']); 
  
  // Get routes data from routes.txt.
  const routes = (await parseLocalCSVToJSON("./static-data/routes.txt"))
  .map(item => {return {
      route_id : item[0],
      route_short_name : item[1],
      route_long_name : item[2],
  }});

  joinedData = await joinObjectsOnField("inner", "route_id", joinedData, routes, ['route_short_name','route_long_name']);

  return joinedData;

  /**
   * Get all stop times which have a stopID included in the given array.
   * @param {string[]} stopIDList - Array of string stop IDs.
   * @returns {object} Object with array of stop times.
   */
  async function getStopTimesFromStopIDs(stopIDList) {
    const stopTimes = (await parseLocalCSVToJSON("./static-data/stop_times.txt"))
    .filter(item => stopIDList.includes(item[3]))
    .map(item => { return {
      trip_id : item[0],
      arrival_time : item[1],
      stop_id : item[3],
      stop_sequence : item[4]
    }});
    return stopTimes;
  }
} 

/**
 * Joins given left and right objects on the given field.
 * @param {string} joinType - Type of join ("left", "right", or "inner").
 * @param {string} onField - Field of both objects to test for a match.
 * @param {object} left - Left object of join.
 * @param {object} right - Right object of join.
 * @param {string[]} addFieldsFromJoin - Fields to be taken from the secondary joined object.
 * @returns {object} Object resulting from join.
 */
async function joinObjectsOnField(joinType, onField, left, right, addFieldsFromJoin) {
  // If join is "right", then simply flip left and right fields with recursion.
  if (joinType === "right")
    return joinObjectsOnField("left", onField, right, left, addFieldsFromJoin);
  
  // Map left object to a joined object.
  const joined = left.map(leftItem => {
  
    // Find a matching right object.
    const rightItem = right.find(rightItem => rightItem[onField] === leftItem[onField]);

    // Handle join if there is no matching rightItem.
    if(!rightItem)
    {
      if (joinType === "inner") 
        return null;
      
      if(joinType === "left")
        return leftItem;
    }

    // Merge matching fields found.
    const mergedRight = {};
    for (const field of addFieldsFromJoin)
      if (rightItem.hasOwnProperty(field))
        mergedRight[field] = rightItem[field];
    
    return{
      ...leftItem,
      ...mergedRight
    };
    
  }).filter(joined => joined != null); // Remove null returns.

  return joined;
}

/**
 * Get all the services that are active on the given date.
 * @param {string} dateString - Date in string format YYYY-MM-DD.
 * @returns {string[]} Array of service ids which cover all active services.
 */
async function getActiveServicesOnDate(dateString) {

  // Get the date and day of the week from string.
  const date = new Date(dateString);
  let day = date.getDay();
  if(day === 0) day = 7;

  // Get calendar dates from calender.txt.
  const calendarBaseServices = (await 
    parseLocalCSVToJSON("./static-data/calendar.txt"))
  .map(data => {
    // Check day of week.
    if(data[day] === 0) 
      return null; 

    return {
      service_id : data[0],
      start_date : data[8],
      end_date : data[9]
    }
  }).filter( data => {
    // Remove null data.
    if(data === null) 
      return false;

    // Check that date given sits in the calendar date interval.
    const parsedStartDate = Date.parse(data.start_date.slice(0, 4) 
    + "-" + data.start_date.slice(4,6) + '-' + data.start_date.slice(6));
    const parsedEndDate = Date.parse(data.end_date.slice(0, 4) 
    + "-" + data.end_date.slice(4,6) + '-' + data.end_date.slice(6));
    const parsedDate = Date.parse(dateString);
    
    if(parsedDate < parsedStartDate || parsedDate > parsedEndDate)
      return false;
    
    return true;
  });

  // Create array which stores all running services on the given date.
  const services = calendarBaseServices.map(data => data.service_id);

  // Get calendar date exceptions from calendar.txt.
  const calendarDateExceptions = (await 
    parseLocalCSVToJSON("./static-data/calendar_dates.txt"))
  .map(data => {
    return {
      service_id : data[0],
      date : data[1],
      exception : data[2]
    }
  })
  .filter(data => data.date === dateString.replaceAll("-", ""));

  // Apply calendar date exceptions to array of services.
  for (const calendarDateException in calendarDateExceptions)
  {
    if(calendarDateException.exception === 2) {
      // Remove service of the given exception.
      const spliceAt = services.findIndex(service => {
        return service == calendarDateException.service_id;
      });
      services.splice(spliceAt, 1);
    }
    else
    if(calendarDateException.exception === 1) {
      // Add service of the given exception.
      services.push(calendarDateException.service_id);
    }
  }
  
  return services;
}

/**
 * Filters stop time data to select stop times which 
 * fit in the given time interval.
 * @param {object} data - Stop time data.
 * @param {string} timeString - Start of time interval as string.
 * @param {int} minuteDifference - Minute length of time interval.
 * @returns {objec} Data filtered over the given time interval.
 */
function filterDataByTime(data, timeString, timeLength) {
  const minTime = HHmmToMinuteCount(timeString);
  const maxTime = minTime + timeLength;

  return data.filter(data => {
    const minuteArrivalTime = HHmmToMinuteCount(data.arrival_time);
    return (minuteArrivalTime >= minTime && minuteArrivalTime < maxTime);
  });

  /**
   * Convect HH:mm time to number of minutes 
   * since the start of the day.
   * @param {string} timeString - HH:mm formatted string.
   * @returns {int} Number of minutes.
   */
  function HHmmToMinuteCount(timeString) {
    return (+timeString[0]) * 600 
    + (+timeString[1]) * 60 
    + (+timeString[3]) * 10 
    + (+timeString[4]); 
  }
}

/**
 * Filters stop time data by its short route name.
 * @param {object} data - Stop time data.
 * @param {string} shortRouteName - Short route name.
 * @returns {object} Filtered stop time data.
 */
function filterDataByShortRouteName(data, shortRouteName) {
  if(shortRouteName == "Show All Routes")
    return data;
  
  return data.filter(data => data.route_short_name == shortRouteName);
}

/**
 * Filters stop time data by its inclusion in a given list of active services.
 * @param {object} data - Stop time data.
 * @param {string[]} activeServices - Array of service ids covering all active services.
 * @returns {object} Filtered stop time data.
 */
function filterDataByActiveServices(data, activeServices) {
  return data.filter(d => activeServices.includes(d.service_id));
}

/**
 * Join live trips data to the stop time data inputted.
 * @param {object} data - Stop time data.
 * @returns {object} Joined stop time and live trips data.
 */
async function joinLiveTripsToData(data) {

  const liveTripsData = await getOnlineCachableData(
    "http://127.0.0.1:5343/gtfs/seq/trip_updates.json", "live_trips");

  return data.map(item => {

    // Find a live trip with a matching trip_id.
    const joinedLiveTrip = liveTripsData["entity"].find(item2 => item2.tripUpdate.trip.tripId === item.trip_id);

    // Check if a joinedLiveTrip was found. If so, set joinedStopUpdate to a match on stop_id.
    // If no joinedLiveTrip was found, set joinedStopUpdate to null.
    const joinedStopUpdate = (joinedLiveTrip? 
      joinedLiveTrip.tripUpdate.stopTimeUpdate.find(item3 => item3.stopId === item.stop_id) : null);
    
    // If a joinedStopUpdate was found, get its arrival time. In the case that there
    // is no arrival time, user departure time.
    const unixTime = (joinedStopUpdate? (joinedStopUpdate.arrival ? 
      joinedStopUpdate.arrival.time : joinedStopUpdate.departure.time) : null);

    // Convert found time to HHmm.
    const time = (unixTime? unixTimeToHHmm(unixTime) : "No Live Data");

    return{
      ...item,
      "live_arrival_time" : time
    }
   });

  /**
   * Converts a unix time stamp to an HH:mm string.
   * @param {int} time - Unix time stamp.
   * @returns {string} HH:mm string refering to time of day.
   */
  function unixTimeToHHmm(time) {
    const dateConverstion = new Date(time * 1000);
    return dateConverstion.toLocaleTimeString("default",{ hour12: false });
  }
}

/**
 * Join live positions data to the stop time data inputted.
 * @param {object} data - Stop time data.
 * @returns {object} Joined stop time and live positions data.
 */
async function joinLivePositionToData(data) {

  const livePositionsData = await getOnlineCachableData(
    "http://127.0.0.1:5343/gtfs/seq/vehicle_positions.json", "live_positions");

  return data.map(item => {
    
    // Find live position with matching trip id.
    const joinedLivePosition = (livePositionsData["entity"].find(item2 => item2.vehicle.trip.tripId === item.trip_id));

    return{
      ...item,
      "position" : joinedLivePosition? joinedLivePosition.vehicle.position : "No Live Data"
    }

  });
}


/**
 * Asks user if they would like to search again.
 * @param {promptSync()} prompt - Instance of prompt-sync() to get user input from console.
 * @param {string} promptText - Text to display in console.
 * @returns {boolean} True if the user wants to search again, otherwise false.
 */
function getSearchAgainInput(prompt, promptText = "Would you like to search again? ") {
  const endStatus = prompt(promptText).toLowerCase();
  if(["y","yes"].includes(endStatus))
    return true;
  else
  if(["n","no"].includes(endStatus))
    return false;
  
  return getSearchAgainInput(prompt, "Please enter a valid option. ");
}

/**
 * Recursive function to get and validate date input from user.
 * @param {promptSync()} prompt - Instance of prompt-sync() to get user input from console.
 * @param {string} promptText - Text to display in console.
 * @returns {string} YYYY-MM-DD string from user input.
 */
function getValidatedDateInput(prompt, promptText = "What date will you depart UQ Lakes station by bus? "){
  const dateRegExp = new RegExp("[0-9]{4}\-[0-9]{2}\-[0-9]{2}");
  const dateText = prompt(promptText);

  if(dateRegExp.test(dateText)) 
    return dateText; 
  
  return getValidatedDateInput(prompt, "Incorrect date format. Please use YYYY-MM-DD. ");
}

/**
 * Recursive function to get and validate time input from console.
 * @param {promptSync()} prompt - Instance of prompt-sync() to get user input from console.
 * @param {string} promptText - Text to display in console.
 * @returns {string} HH:mm string from user input.
 */
function getValidatedTimeInput(
  prompt, 
  promptText = "What time will you depart UQ Lakes station by bus? "
  ) {
  const timeRegExp = new RegExp("^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$");
  const timeText = prompt(promptText);

  if(timeRegExp.test(timeText)) 
    return timeText; 
  
  return getValidatedTimeInput(prompt, "Incorrect time format. Please use HH:mm. ");
}

/**
 * Recursive function to select a bus route from user input.
 * @param {promptSync()} prompt - Instance of prompt-sync() to get user input from console.
 * @param {string} promptText - Text to display in console.
 * @returns {string} Valid bus route.
 */
function getValidatedRouteInput(
  prompt, 
  data, 
  promptText = "What Bus Route would you like to take? "
  ) {
  // Gets routes available.
  const routesAvailable = data.map(d =>  d.route_short_name)
  .filter((value, index, array) => array.indexOf(value) === index);

  // Get routes index to display for user.
  const routesDisplay = routesAvailable.map((value, index) =>{
    return ` ${index + 2}: ${value}`;
  });

  // Display route index and get user input.
  const routeText = prompt(promptText + " (1: Show All Routes," + routesDisplay+ "): ");

  // Check if input was a number.
  if(!isNaN(routeText))
  {
    // Select route from Show All Routes or the routeAvailable array.
    const routeNum = parseInt(routeText);
    if(routeNum === 1) {
      return "Show All Routes";
    }
    else if(routeNum >= 2 && routeNum - 2 < routesAvailable.length){
      return routesAvailable[routeNum-2];
    }
  }

  // Call self if input was invalid.
  return getValidatedRouteInput(prompt, data, "Please enter a valid option for a bus route. ");
}

/**
 * Parses a CSV file from the given path into JSON format.
 * @param {string} path - Local path to where the CSV file should be stored.
 * @returns {object} Data from the CSV file at the given path.
 */
async function parseLocalCSVToJSON(path) {
  const returnJSON = [];
  return new Promise((resolve) => {
    fs.createReadStream(path).pipe(parse())
    .on("data", (data) => { returnJSON.push(data); })
    .on("end", () => resolve(returnJSON))
  });
};

/**
 * If data is validly cached, reads the data, otherwise 
 * gets data from the given url and caches it.
 * @param {string} url - Link to onine data.
 * @param {string} fileName - Name of cached file.
 */
async function getOnlineCachableData(url, fileName) {
  const filePath = "cached-data/translink-parser_" + fileName + ".json";
  if(fs.existsSync(filePath)) {
    // Get the cache at the given path.
    const data = await readJSONCache(filePath);
    
    // Make sure the cached data was retrieved without errors.
    if(data != null) {
      // Only accept cached data if it was cached in the last 5 minutes.
      // Otherwise it will be flushed and overwritten.
      const nowTime = Date.now();
      const cachedDate = new Date(+data["cached_time"]);
      if(nowTime - cachedDate < 300000) return data;
    }
  }

  // If there was no appropriate cache file: fetch data and
  // cache that data for later calls. Return that data.
  const data = await parseOnlineDataToJSON(url);
  await cacheJSONData(data, filePath);
  return data;

  /**
   * Saves the given JSON data to the given file path.
   * @param {object} data - Object of data to cache.
   * @param {string} filePath - Local path to save to.
   */
  async function cacheJSONData(data, filePath) {
    try {
      // Adds date of cache creation to object for caching.
      data["cached_time"] = Date.now();
      await fs.writeFileSync(filePath, JSON.stringify(data));
    }
    catch(e){
      console.log(e);
    }
  }

  /**
   * Gets JSON data from the given file path.
   * @param {string} filePath - Local path to json file.
   * @returns {object} Parsed object from cache file path, or null if not found.
   */
  async function readJSONCache(filePath) {
    try {
      const data = await fs.readFileSync(filePath);
      const dataJSON = await JSON.parse(data);
      return dataJSON;
    }
    catch(e){
      console.log(e);
      return null;
    }
  }
}

/**
 * Fetch JSON data from the given url.
 * @param {string} url - .json link pointing to JSON data online.
 * @returns {object} An object fetched from the given url.
 */
async function parseOnlineDataToJSON(url){
  const response = await fetch(url);
  if(!response.ok) {
    return null;
  }
  
  const returnJSON = await response.json();
  return returnJSON;
}
