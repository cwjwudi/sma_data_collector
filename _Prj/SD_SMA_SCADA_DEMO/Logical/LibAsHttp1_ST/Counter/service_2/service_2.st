(********************************************************************
 * COPYRIGHT -- Bernecker + Rainer 
 ********************************************************************
 * Program: service_2
 * File: service_2.st
 * Author: Bernecker + Rainer
 * Created: February 17, 2012
 ********************************************************************
 * Implementation of program service_2
 ********************************************************************)

PROGRAM _INIT

	Webservice.pServiceName 	:= ADR('Counter.cgi'); (* Name of webservice *)
	Webservice.option 			:= httpOPTION_HTTP_10 + httpOPTION_SERVICE_TYPE_NAME;

	Webservice.pResponseData 	:= ADR(Response);
	Webservice.pResponseHeader  := ADR(ResponseHeader);

	(* Register Webservice*)
	Webservice(enable := 1);
END_PROGRAM


PROGRAM _CYCLIC

	IF  Webservice.send = TRUE  THEN 
		Webservice.send := FALSE; (* Reset *)
	ELSIF Webservice.status = ERR_OK AND Webservice.phase = httpPHASE_RECEIVED AND Webservice.send = FALSE THEN 
		(* Create Response *)
		ResponseHeader.contentType 	:= 'text/plain'; (* Response is plain text data and this is the correct MIME type *)
		
		
		Helper 						:= (UINT_TO_STRING(Counter));
		Counter 					:= Counter + 1;
		Response 					:= 'This webservice was requested ';
		strcat(ADR(Response), ADR(Helper));
		strcat(ADR(Response), ADR(' times.'));
		
		Webservice.responseDataLen 	:= strlen(ADR(Response)); (* Length of the response *)
		Webservice.send 			:= TRUE; (* Send on positive edge*)
	END_IF
	
	Webservice();
END_PROGRAM


PROGRAM _EXIT

	(* Unregister Webservice *)
	Webservice(enable := 0);

END_PROGRAM