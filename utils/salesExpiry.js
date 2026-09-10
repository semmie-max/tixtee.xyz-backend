function getSalesCutoff(event){
  if(event.sales_end_date){
    return new Date(event.sales_end_date);
  }
  const eventStart = new Date(`${String(event.event_date).slice(0,10)}T${event.start_time || '00:00:00'}`);
  return new Date(eventStart.getTime() - 30 * 60 * 1000);
}

module.exports = { getSalesCutoff };