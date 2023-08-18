import promptSync from 'prompt-sync'; 
import fs from "fs";
import {parse} from "csv-parse";

/**
 * Joins data for each stop time at the UQLakes station.
 * @returns Object with accumulated stop time data.
 */
async function LoadAllStaticUQLakesData(){
  
  // Get data from stop.txt
  const stops = (await parseLocalCSVToJSON("./static-data/stops.txt"))
  .filter(stop => stop[9] == "place_uqlksa")
  .map(stop => { return{stop_id : stop[0]}});

  // Get data from routes.txt and join with tripsData
  const routes = (await parseLocalCSVToJSON("./static-data/routes.txt"))

  // Get data from calendar.txt
  const calendarDates = (await parseLocalCSVToJSON("./static-data/calendar_dates.txt"));

  // Get data from trips.txt
  const trips = (await parseLocalCSVToJSON("./static-data/trips.txt"));

  // Get data from stop_times.txt and join with stopsData
  const stopTimes = (await parseLocalCSVToJSON("./static-data/stop_times.txt"))
  .map( stopTime => {
    
      const joinedStop = stops.find(stop => stop.stop_id === stopTime[3]);
      if (joinedStop == null) return null;

      const joinedTrip = trips.find(trip => trip[2] === stopTime[0]);
      if (joinedStop == null) return null;

      const joinedRoute = routes.find(route => route[0] === joinedTrip[0]);
      if(joinedRoute == null) return null;

      const joinedCalendar = calendarDates.find(date => date[0] === joinedTrip[1]);
      if(joinedCalendar == null) return null;

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
  }).filter(stopTime => stopTime!=null);
  
  return stopTimes;
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
    if(routeShortName != "ShowAllRoutes" && data.route_short_name != routeShortName) 
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


/**
 * Recursive loop to be called once, starting the program.
 */
async function mainLoop(){
  
  const staticData = await LoadAllStaticUQLakesData();

  console.log("Welcome to the UQ Lakes station bus tracker!");

  // Get valid user input to filter results.
  const prompt = promptSync();
    
  const inputDate = getValidatedDateInput(prompt);
  const inputTime = getValidatedTimeInput(prompt);
  const inputRoute = getValidatedBusRouteInput(prompt);
  
  console.log(await filterData(staticData, inputRoute, inputTime, 10, inputDate));
  
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
  let returnJson = [];
  return new Promise((resolve) => {
    fs.createReadStream(path).pipe(parse())
    .on("data", (data) => { returnJson.push(data); })
    .on("end", () => resolve(returnJson))
  });
};



mainLoop();




/*
async function showTableOfData(parentStation, routeShortName, time, minuteRange, date ){

  // Get useful data from static stop.txt
  const usefulStopsData = (await parseLocalCSVToJSON("./static-data/stops.txt"))
  .filter(stop => stop[9] == parentStation)
  .map(stop => { return{stop_id : stop[0]}});
  console.log(usefulStopsData); 

  // Get useful data from static calender_dates.txt
  const usefulCalenderDatesData = (await parseLocalCSVToJSON("./static-data/calendar_dates.txt"))
  .filter(calendarDate => calendarDate[1] == date)
  .map(calendarDate => { return{service_id : calendarDate[0]}});
  console.log(usefulCalenderDatesData); 

  // Get useful data from static routes.txt
  const usefulRoutesData = (await parseLocalCSVToJSON("./static-data/routes.txt"))
  .filter(route => route[1] == routeShortName)
  .map(route => { 
    return{
      route_id : route[0],
      route_long_name : route[2]
    }
  });
  console.log(usefulRoutesData); 

  // Get useful data from static trips.txt, joining with routes and services
  const usefulTripsData = (await parseLocalCSVToJSON("./static-data/trips.txt"))
  .map(trip => {
      const joinedCalendarDate = usefulCalenderDatesData.find(calendarDate =>
       calendarDate.service_id === trip[1]);

      const joinedRoute = usefulRoutesData.find(route =>
       route.route_id === trip[0]);

      if (joinedCalendarDate == null || joinedRoute == null) return null;

      return{
        route_id : joinedRoute.route_id,
        service_id : joinedCalendarDate.service_id,
        trip_id : trip[2],
        route_long_name : joinedRoute.route_long_name,
        head_sign : trip[3]
      }
  }).filter(trip => trip != null);
  console.log(usefulTripsData);


  // Join all data with stop_times data.

  const minuteTime = HourTimeToMinutes("08:00");
  const minTime = minuteTime - 10;
  const maxTime = minuteTime + 10;

  
  const usefulStopTimesData = (await parseLocalCSVToJSON("./static-data/stop_times.txt"))
  .map(stopTime => {
    
      const joinedTrip = usefulTripsData.find(trip => trip.trip_id === stopTime[0]);
      if(joinedTrip == null) return null;

      const joinedStop = usefulStopsData.find(stop => stop.stop_id === stopTime[3]);
      if (joinedStop == null) return null;

      return{
        route_id : joinedTrip.route_id,
        service_id : joinedTrip.service_id,
        trip_id : joinedTrip.trip_id,
        route_long_name : joinedTrip.route_long_name,
        stop_id : joinedStop.stop_id,
        arrival_time : stopTime[1],
        head_sign : joinedTrip.head_sign
      }
  }).filter(stopTime => {
    if(stopTime == null) return false;
    const minuteArrivalTime = HourTimeToMinutes(stopTime.arrival_time);
    console.log(minuteArrivalTime, " ", maxTime, " ", minTime);
    return( minuteArrivalTime >= minTime && minuteArrivalTime <= maxTime );
  });

  console.log(usefulStopTimesData);
}
*/