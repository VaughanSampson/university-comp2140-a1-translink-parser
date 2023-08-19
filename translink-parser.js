import promptSync from 'prompt-sync'; 
import fs from "fs";
import {parse} from "csv-parse";



/**
 * Get stop times which are have a stopID included in the given array.
 * @param {*} stopIDList Array of stop IDs.
 * @returns JSON array of stop times which have a stopID included in the given array
 */
async function getStopTimesFromStopIDs(stopIDList){
  const stopTimes = (await parseLocalCSVToJSON("./static-data/stop_times.txt"))
  .filter(item => stopIDList.includes(item[3]))
  .map(item => { return {
    trip_id : item[0],
    arrival_time : item[1],
    stop_id : item[3]
  }});
  return stopTimes;
}

async function generalJoinOnField(joinType = "inner", onField, left, right, addFieldsFromJoin)
{
  // If join is "right", then simply flip left and right fields with recursion.
  if (joinType === "right")
    return generalJoinOnField("left", onField, right, left, addFieldsFromJoin);
  
  // Join with array.map and array.find.
  const joined = left.map( leftItem => {

      const rightItem = right.find(rightItem => rightItem[onField] === leftItem[onField]);

      // Handle a there being no matching rightItem.
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

async function joinLiveDataToStaticData(staticData, liveTripsData, livePositionsData){

  const joinData = staticData.map(data => {

    const joinedLiveTrip = liveTripsData.find(trip => trip.trip_id === data.trip_id);
    const joinedLivePostion = livePositionsData.find(position => position.vehicle.trip.trip_id === data.trip_id);
    //const joinedLiveStop = null;
    //if(joinedLiveTrip) joinedLiveTrip.tripUpdate.stopTimeUpdate.find(stop => stop.stop_id === data.stop_id);
    
    return{
      "staticData" : data,
      "liveTripsData" : joinedLiveTrip,
      "livePositionsData" : joinedLivePostion
    }

  });

  return joinData;

}


/**
 * Joins data for each stop time at the UQLakes station.
 * @returns Object with accumulated stop time results.
 */

async function loadUQStopsData(){

  // Get stopIDs from stop.txt.
  const stopIDs = (await parseLocalCSVToJSON("./static-data/stops.txt"))
  .filter(item => item[9] == "place_uqlksa")
  .map(item => item[0]);
  console.log(stopIDs);

  // Get stop times from stop_times.txt, filtered by stopID.
  const stopTimes = await getStopTimesFromStopIDs(stopIDs);

  // Get trips data from trips.txt.
  const trips = (await parseLocalCSVToJSON("./static-data/trips.txt"))
  .map(item => {return {
    route_id : item[0],
    service_id : item[1],
    trip_id : item[2],
    trip_headsign : item[4]
  }});

  let joinedData = await generalJoinOnField("inner", "trip_id", stopTimes, trips, ['route_id','service_id','trip_headsign']); 
  
  // Get routes data from routes.txt.
  const routes = (await parseLocalCSVToJSON("./static-data/routes.txt"))
  .map(item => {return {
      route_id : item[0],
      route_short_name : item[1],
      route_long_name : item[2],
  }});

  joinedData = await generalJoinOnField("inner", "route_id", joinedData, routes, ['route_short_name','route_long_name']);

  return joinedData;
/*

  // Get data from calendar.txt
  

  // Get data from calendar_dates.txt
  const calendarDates = (await parseLocalCSVToJSON("./static-data/calendar_dates.txt"))
  .map(item => {return {
    service_id : item[0],
    date : item[1],
    exception_type : item[2]
  }});
*/

  // Get data from stop_times.txt and join with all other data
  /*const stopTimes = (await parseLocalCSVToJSON("./static-data/stop_times.txt"))
  .map( stopTime => {
    
      const joinedStop = stops.find(stop => stop.stop_id === stopTime[3]);
      if (!joinedStop) return null;

      const joinedTrip = trips.find(trip => trip[2] === stopTime[0]);

      const joinedRoute = routes.find(route => route[0] === joinedTrip[0]);

      const joinedCalendar = calendar.find(service => service[0] === joinedTrip[1]);

      if(!joinedCalendar) console.log(joinedTrip[1]);

      return{
        trip_id : stopTime[0],
        stop_id : joinedStop.stop_id,
        arrival_time : stopTime[1],
        route_id : joinedTrip[0],
        service_id : joinedTrip[1],
        date : joinedCalendar[1],
        route_short_name : joinedRoute[1],
        route_long_name : joinedRoute[2],
        head_sign : joinedTrip[3]
      }

  }).filter(stopTime => stopTime != null);
  
  return stopTimes;
  */
} 


/**
 * Filters data object of stop times data.
 * @param {*} staticData instance of data object.
 * @param {*} routeShortName route name to filter upon.
 * @param {*} time time to filter upon, given range.
 * @param {*} minuteRange minute difference acceptable when filtering over time.
 * @param {*} date date to filter upon.
 * @returns 
 */

function filterData(staticData, routeShortName, time, minuteRange, date){

  const minuteTime = hourTimeToMinutes(time);
  const minTime = minuteTime - minuteRange;
  const maxTime = minuteTime + minuteRange;

  return staticData.filter(data => {
    if(routeShortName !== "Show All Routes" && data.route_short_name !== routeShortName) 
      return false;

    const minuteArrivalTime = hourTimeToMinutes(data.arrival_time);
    if(minuteArrivalTime < minTime || minuteArrivalTime > maxTime)
      return false;

    if(data.date != date) 
      return false;

    return true;
  });
}


/**
 * Convect HH:mm time to number of minutes.
 * @param {*} timeString HH:mm formatted string.
 * @returns number of minutes.
 */
function hourTimeToMinutes(timeString){
  return Number(timeString[0]) * 600 + Number(timeString[1]) 
  * 60 + Number(timeString[3]) * 10 + Number(timeString[4]);
}

async function joinStopsWithCalendarOnDate(stopsData, textDate){

  // Get calendar data from calender.txt.
  const calendar = (await parseLocalCSVToJSON("./static-data/calendar.txt"))
  .map(item => {return {
      sunday : item[7],
      monday : item[1],
      tuesday : item[2],
      wednesday : item[3],
      thursday : item[4],
      friday : item[5],
      saturday : item[6],
      service_id : item[0],
      start_date : item[8],
      end_date : item[9]
  }});

  calendar.filter( data => {
    // Check start date.
    if(Date.parse(textDate) < Date.parse(data.start_date.slice(0, 3) + "-" + data.start_date.slice(3-5) + '-' + data.start_date.slice(5)))
      return false;

    // Check end date.
    if(Date.parse(textDate) > Date.parse(data.end_date.slice(0, 3) + "-" + data.end_date.slice(3-5) + '-' + data.end_date.slice(5)))
      return false;

    // Check weekday.
    let date = new Date(Date.parse(textDate));
    if(data[date.getDay()-1] === 0) 
      return false;
    
    return true;
  });

  let joinedData = await generalJoinOnField("inner", "service_id", stopsData, calendar, ['start_date','end_date', 'saturday']); 
  return joinedData;
}

/**
 * Recursive loop to be called to start the program.
 */
async function mainLoop(){
   
  //const livePositionsData = await parseOnlineDataToJSON("http://127.0.0.1:5343/gtfs/seq/vehicle_positions.json");
  
  //const liveTripsData = await parseOnlineDataToJSON("http://127.0.0.1:5343/gtfs/seq/trip_updates.json");
  
  const uqStopsData = await loadUQStopsData();
  const uqStopsOnDate = await joinStopsWithCalendarOnDate(uqStopsData, "23-08-19");
  console.log(uqStopsOnDate);
  //const completeJoin = await joinLiveDataToStaticData(staticData, liveTripsData["entity"],livePositionsData["entity"]);
  //console.log(completeJoin[0]["staticData"]);
  //console.log(completeJoin[0]["liveTripsData"]);

  // Get valid user input to filter results.
  const prompt = promptSync();
  //const inputDate = getValidatedDateInput(prompt);
  //const inputTime = getValidatedTimeInput(prompt);
  //const inputRoute = getValidatedBusRouteInput(prompt);
  
  //console.log(completeJoin);
  //console.log(await filterOnDate(completeJoin, "20230921"));
  
  // Get valid user input to end or loop the program.
  const endStatus = prompt("Would you like to search again?");

  if(["y","yes"].includes(endStatus)) 
  {
    mainLoop();
  }
  else
  if(["n","no"].includes(endStatus))
  {
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
    return dateText.replaceAll("-",""); 
  
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
function getValidatedBusRouteInput(prompt, promptText = "What Bus Route would you like to take?"){
  const routeText = prompt(promptText);
  if(routeText === "Show All Routes" || !isNaN(routeText))
    return routeText;

  return getValidatedBusRouteInput(prompt, "Please enter a valid option for a bus route.");
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
 * Fetch JSON data from the given path.
 * @param {*} url pointing to JSON data online.
 * @returns A JSON object fetched from the given path.
 */
async function parseOnlineDataToJSON(url){
  const response = await fetch(url);
  const returnJSON = await response.json();
  return returnJSON;
}

mainLoop();
