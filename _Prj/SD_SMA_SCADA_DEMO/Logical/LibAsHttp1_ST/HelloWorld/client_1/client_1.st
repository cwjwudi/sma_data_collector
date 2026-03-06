(********************************************************************
 * COPYRIGHT -- Bernecker + Rainer 
 ********************************************************************
 * Program: client_1
 * File: client_1.st
 * Author: Bernecker + Rainer
 * Created: February 16, 2012
 ********************************************************************
 * Implementation of program client_1
 ********************************************************************)

PROGRAM _INIT

	Ressource 				:= '/HelloWorld.cgi';
	
	Client.method 			:= httpMETHOD_GET;
	Client.option 			:= httpOPTION_HTTP_11;
	
	Client.pHost 			:= ADR(Host);
	Client.pUri 			:= ADR(Ressource);
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