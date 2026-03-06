(********************************************************************
 * COPYRIGHT -- Bernecker + Rainer
 ********************************************************************
 * Program: service_4
 * File: service_4.st
 * Author: Bernecker + Rainer
 * Created: February 16, 2012
 ********************************************************************
 * Implementation of program service_4
 ********************************************************************)

PROGRAM _INIT



	
	Webservice.pServiceName 	:= ADR('formdata.cgi'); (* Name of webservice *)
	Webservice.option 			:= httpOPTION_HTTP_11 + httpOPTION_SERVICE_TYPE_NAME;
	Webservice.pResponseHeader  := ADR(ResponseHeader);
	Webservice.pRequestData  	:= ADR(Request);
	Webservice.requestDataSize  := SIZEOF(Request);
	Webservice.pResponseData 	:= ADR(Response);

	
	(* Register Webservice*)
	Webservice(enable := 1);

END_PROGRAM


PROGRAM _CYCLIC
	
	IF  Webservice.send = TRUE  THEN 
		Webservice.send := FALSE; (* Reset *)
	ELSIF Webservice.status = ERR_OK AND Webservice.send = FALSE AND Webservice.phase = httpPHASE_RECEIVED THEN 
		(* Create Response *)	
		ResponseHeader.contentType 	:= 'text/html'; (* Response is HTML data and this is the correct MIME type *)
		IF Webservice.method = httpMETHOD_POST THEN
			
			UrlParam.enable := TRUE;
			UrlParam.pParam := ADR('usertext1');
			UrlParam.pSrc := ADR(Request);
			UrlParam.pValue := ADR(FormParam1);
			UrlParam.valueSize := SIZEOF(FormParam1);
			UrlParam();
			strcpy( strcpy( strcpy(ADR(Response) , ADR('<html><body><h2>Form Result</h2><p>First field contained: <i>')), ADR(FormParam1)), ADR('</i></p>') ) ;
		
			UrlParam.pParam := ADR('usertext2');
			UrlParam.pValue := ADR(FormParam2);
			UrlParam.valueSize := SIZEOF(FormParam2);
			UrlParam();
			strcat(ADR(Response),ADR('<p>Second field contained: <i>'));
			strcat(ADR(Response), ADR(FormParam2));
			strcat(ADR(Response),ADR('</i></p></body></html>'));
		ELSE
			Response := '<html><body><h2>Simple Form</h2><form method="POST" action="/formdata.cgi"><input type="text" name="usertext1" size="20" /><br><input type="text" name="usertext2" size="20" /><br><input type="submit" name="bt1" value="Submit"></form></body></html>';
		END_IF
		
		Webservice.responseDataLen := strlen(ADR(Response));
		Webservice.send := TRUE; (* Send on positive edge*)
	END_IF
	
	Webservice();
END_PROGRAM


PROGRAM _EXIT

	(* Unregister Webservice *)
	Webservice(enable := 0);
	
END_PROGRAM