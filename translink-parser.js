import promptSync from 'prompt-sync'; 
import fs from "fs";
import {parse} from "csv-parse";

/**
 * Joins given left and right objects where the given field is equal for each.
 * @param {*} joinType Type of join ("left", "right", or "inner").
 * @param {*} onField Field of both objects to test for a match.
 * @param {*} left Left object.
 * @param {*} right Right object.
 * @param {*} addFieldsFromJoin Fields to be taken from the secondary joined object.
 * @returns Joined objects.
 */
async function joinOnField(joinType = "inner", onField, left, right, addFieldsFromJoin)
{
  // If join is "right", then simply flip left and right fields with recursion.
  if (joinType === "right")
    return joinOnField("left", onField, right, left, addFieldsFromJoin);
  
  // Join with array.map and array.find.
  const joined = left.map(leftItem => {

      const rightItem = right.find(rightItem => rightItem[onField] === leftItem[onField]);
      /*
      if(onField === "trip_id")
      {
        console.log(rightItem[onField]);
        console.log(leftItem[onField]+ "\n");
      }
      */

      // Handle join if there is no matching rightItem.
      if(!rightItem)
      {
        if (joinType === "inner") 
          return null;
        
        if(joinType === "left")
          return leftItem;
      }

      // Merge matching fields found
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
 * Get stop times which have a stopID which is included in the given array.
 * @param {*} stopIDList Array of stop IDs.
 * @returns JSON array of stop times which have a stopID included in the given array
 */
async function getStopTimesFromStopIDs(stopIDList){
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


/**
 * Gets and joins stop time data for UQ Lakes station.
 * @returns Object with accumulated stop time results.
 */
async function loadUQStopsData(){

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

  let joinedData = await joinOnField("inner", "trip_id", stopTimes, trips, ['route_id','service_id','trip_headsign']); 
  
  // Get routes data from routes.txt.
  const routes = (await parseLocalCSVToJSON("./static-data/routes.txt"))
  .map(item => {return {
      route_id : item[0],
      route_short_name : item[1],
      route_long_name : item[2],
  }});

  joinedData = await joinOnField("inner", "route_id", joinedData, routes, ['route_short_name','route_long_name']);

  return joinedData;
} 

/**
 * Filters stop time data to select stop times which fit in time interval.
 * @param {*} data Stop time data.
 * @param {*} timeString Start of time interval.
 * @param {*} minuteDifference Length of time interval.
 * @returns Data filtered over time interval.
 */
function filterDataByTime(data, timeString, timeLength){
  const minTime = HHmmToMinuteCount(timeString);
  const maxTime = minTime + timeLength;

  return data.filter(data => {
    const minuteArrivalTime = HHmmToMinuteCount(data.arrival_time);
    return (minuteArrivalTime >= minTime && minuteArrivalTime <= maxTime);
  });

  /**
   * Convect HH:mm time to number of minutes.
   * @param {*} timeString HH:mm formatted string.
   * @returns number of minutes.
   */
  function HHmmToMinuteCount(timeString){
    return (+timeString[0]) * 600 
    + (+timeString[1]) * 60 
    + (+timeString[3]) * 10 
    + (+timeString[4]); 
  }
}

/**
 * Filters stop time data by its short route name.
 * @param {*} data stop time data.
 * @param {*} shortRouteName short route name.
 * @returns Filtered stop time data.
 */
function filterDataByShortRouteName(data, shortRouteName){
  if(shortRouteName == "Show All Routes")
    return data;
  
  return data.filter(data => data.route_short_name == shortRouteName);
}

/**
 * Filters stop time data by its inclusion in a given list of active services.
 * @param {*} data stop time data.
 * @param {*} activeServices active services.
 * @returns Filtered stop time data.
 */
function filterDataByActiveServices(data, activeServices){
  return data.filter(d => activeServices.includes(d.service_id));
}

/**
 * Get all the services that are active on the given date.
 * @param {*} dateString 
 * @returns 
 */
async function getActiveServicesOnDate(dateString){

  // Get date and day of wee from string.
  const date = new Date(dateString);
  let day = date.getDay();
  if(day === 0) day = 7;

  // Get calendar dates from calender.txt.
  const calendarBaseServices = (await parseLocalCSVToJSON("./static-data/calendar.txt"))
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

    // Check that date given sits in calendar date interval.
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
  const calendarDateExceptions = (await parseLocalCSVToJSON("./static-data/calendar_dates.txt"))
  .map(data => {
    return {
      service_id : data[0],
      date : data[1],
      exception : data[2]
    }
  })
  .filter(data => data.date === dateString.replaceAll("-", ""));

  // Apply calendar date exceptions to array of services.
  for(calendarDateException in calendarDateExceptions)
  {
    if(calendarDateException.exception === 2)
    {
      // Remove service of the given exception.
      const spliceAt = services.findIndex(service => service == calendarDateException.service_id);
      services.splice(spliceAt, 1);
    }
    else
    if(calendarDateException.exception === 1)
    {
      // Add service of the given exception.
      services.push(calendarDateException.service_id);
    }
  }
  
  return services;
}

/**
 * Join the relevant live trips data to the stop time data inputted.
 * @param {*} data stop time data.
 * @param {*} liveTripsData live trips data.
 * @returns Joined stop time and live trips data.
 */
async function joinLiveTripsToData(data){

  const liveTripsData = await getOnlineCachableData(
    "http://127.0.0.1:5343/gtfs/seq/trip_updates.json", "live_trips");

  return data.map(item => {
    
    const joinedLiveTrip = liveTripsData["entity"].find(item2 => item2.tripUpdate.trip.tripId === item.trip_id);

    const joinedStopUpdate = (joinedLiveTrip? 
      joinedLiveTrip.tripUpdate.stopTimeUpdate.find(item3 => item3.stopId === item.stop_id) : null);
    
    const unixTime = (joinedStopUpdate? (joinedStopUpdate.arrival ? 
      joinedStopUpdate.arrival.time : joinedStopUpdate.departure.time) : null);

    const time = (unixTime? unixTimeToHHmm(unixTime) : "No Live Data");

    return{
      ...item,
      "live_arrival_time" : time
    }

    /**
     * Converts a unix time stamp to an HH:mm string.
     * @param {*} time Unix time stamp.
     * @returns HHmm string refering to time of day.
     */
    function unixTimeToHHmm(time){
      const dateConverstion = new Date(time * 1000);
      return dateConverstion.toLocaleTimeString("default",{ hour12: false });
    }
    
   });
}

/**
 * Join the relevant live position data to the stop time data inputted.
 * @param {*} data stop time data.
 * @param {*} livePositionsData live positions data.
 * @returns Joined stop time and live positions data.
 */
async function joinLivePositionToData(data){

  const livePositionsData = await getOnlineCachableData(
    "http://127.0.0.1:5343/gtfs/seq/vehicle_positions.json", "live_positions");

  return data.map(item => {
    
    const joinedLivePosition = (livePositionsData["entity"].find(item2 => item2.vehicle.trip.tripId === item.trip_id));

    return{
      ...item,
      "position" : joinedLivePosition? joinedLivePosition.vehicle.position : "No Live Data"
    }

  });
}

/**
 * Recursive loop which is called to start and run the program.
 * @param {*} preLoadedUqStopsData Data which has already been loaded in.
 */
async function mainLoop(preLoadedUqStopsData = null){

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
  
  // Get valid user input to end or loop the program.
  const endStatus = prompt("Would you like to search again?").toLowerCase();

  if(["y","yes"].includes(endStatus)) 
  {
    mainLoop(uqStopsData);
  }
  else
  if(["n","no"].includes(endStatus))
  {
    // 'nn' input passed which needs fixing.
    console.log("Thanks for using the UQ Lakes station bus tracker");
    process.exit();
  } 

}

/**
 * Recursive function to get and validate date input from console.
 * @param {*} prompt instance of prompt-sync() to get user input from console.
 * @param {*} promptText text to display in console.
 * @returns validated input string with hyphens excluded.
 */
function getValidatedDateInput(prompt, promptText = "What date will you depart UQ Lakes station by bus?"){
  const dateRegExp = new RegExp("[0-9]{4}\-[0-9]{2}\-[0-9]{2}");
  const dateText = prompt(promptText);

  if(dateRegExp.test(dateText)) 
    return dateText; 
  
  return getValidatedDateInput(prompt, "Incorrect date format. Please use YYYY-MM-DD");
}

/**
 * Recursive function to get and validate time input from console.
 * @param {*} prompt instance of prompt-sync() to get user input from console.
 * @param {*} promptText text to display in console.
 * @returns array of strings, including hour and then minutes.
 */
function getValidatedTimeInput(prompt, promptText = "What time will you depart UQ Lakes station by bus?"){
  const timeRegExp = new RegExp("[0-9]{2}\:[0-9]{2}");
  const timeText = prompt(promptText);

  if(timeRegExp.test(timeText)) 
    return timeText; 
  
  return getValidatedTimeInput(prompt, "Incorrect time format. Please use HH:mm");
}

/**
 * Recursive function to get and validate bus route input from the console.
 * @param {*} prompt instance of prompt-sync() to get user input from console.
 * @param {*} promptText text to display in console.
 * @returns inputted string.
 */
function getValidatedRouteInput(prompt, data, promptText = "What Bus Route would you like to take?"){
  // Gets routes available
  const routesAvailable = data.map(d =>  d.route_short_name)
  .filter((value, index, array) => array.indexOf(value) === index);

  const routesDisplay = routesAvailable.map((value, index) =>{
    return ` ${index + 2}: ${value}`;
  });

  const routeText = prompt(promptText + " (1: Show All Routes," + routesDisplay+ "): ");
  if(!isNaN(routeText))
  {
    const routeNum = parseInt(routeText);
    if(routeNum === 1)
      return "Show All Routes";
    else
    if(routeNum >= 2 && routeNum - 2 < routesAvailable.length)
      return routesAvailable[routeNum-2];
  }
  return getValidatedRouteInput(prompt, data, "Please enter a valid option for a bus route.");
}

/**
 * Parses a CSV file from the given path into JSON format.
 * @param {*} path local path where the CSV file should be stored.
 * @returns JSON formatted date from the file data.
 */
async function parseLocalCSVToJSON(path){
  const returnJSON = [];
  return new Promise((resolve) => {
    fs.createReadStream(path).pipe(parse())
    .on("data", (data) => { returnJSON.push(data); })
    .on("end", () => resolve(returnJSON))
  });
};

/**
 * If data is validly cached, reads the data, otherwise gets data from url and caches it.
 * @param {*} url Link to onine data.
 * @param {*} fileName Name of cached file.
 */
async function getOnlineCachableData(url, fileName){
  const filePath = "cached-data/translink-parser_" + fileName + ".json";
  if(fs.existsSync(filePath))
  {
    const data = await readJSONCache(filePath);

    // Only accept cached data if it was made in the last 5 minutes.
    const nowTime = Date.now();
    const cachedDate = new Date(+data["cached_time"]);
    if(nowTime - cachedDate < 300000)
      return data;
  }

  // If there was no appropriate cache file, fetch data and cache it.
  const data = await parseOnlineDataToJSON(url);
  await cacheJSONData(data, filePath);
  return data;
}

/**
 * Saves the given JSON data to the given file path.
 * @param {*} data JSON data.
 * @param {*} filePath Path to save to.
 */
async function cacheJSONData(data, filePath){
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
 * @param {*} filePath Path to json file.
 * @returns Parsed JSON data read from the given file path.
 */
async function readJSONCache(filePath) {
  try {
      const data = await fs.readFileSync(filePath);
      const dataJSON = await JSON.parse(data);
      return dataJSON;
  }
  catch(e){
      console.log(e);
  }
}

/**
 * Fetch JSON data from the given path.
 * @param {*} url pointing to JSON data online.
 * @returns A JSON object fetched from the given path.
 */
async function parseOnlineDataToJSON(url){
  const response = await fetch(url);
  if(!response.ok) {
    return null;
  }
  
  const returnJSON = await response.json();
  return returnJSON;
}

mainLoop();
