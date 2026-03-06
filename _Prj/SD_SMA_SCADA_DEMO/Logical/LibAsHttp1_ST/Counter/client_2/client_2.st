(********************************************************************
 * COPYRIGHT -- Bernecker + Rainer 
 ********************************************************************
 * Program: Client_2
 * File: Client_2.st
 * Author: Bernecker + Rainer
 * Created: February 17, 2012
 ********************************************************************
 * Implementation of program Client_2
 ********************************************************************)
PROGRAM _INIT


	Ressource 				:= '/Counter.cgi';	(* Name of file or webservice to be requested *)
	Client.pUri 			:= ADR(Ressource);
	Client.method 			:= httpMETHOD_GET; 	(* Request method *)
	
	Client.option 			:= httpOPTION_HTTP_11; 
	Client.pHost 			:= ADR(Host); 		(* Host to connect to *)
	
	
	Client.pResponseData 	:= ADR(Responsedata); 
	Client.responseDataSize := SIZEOF(Responsedata);
	
	
END_PROGRAM


PROGRAM _CYCLIC

	Client(enable := Doenable, send := Dosend); (* Call httpClient() *)
	
	(* TODO: Error handling *)
	
END_PROGRAM


PROGRAM _EXIT
	
	(* Release Client instance *)
	Client(enable := 0, send := 0);
	
END_PROGRAM