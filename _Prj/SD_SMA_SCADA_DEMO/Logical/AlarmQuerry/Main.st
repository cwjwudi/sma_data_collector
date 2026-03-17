
PROGRAM _INIT
	(* Insert code here *)
	 
END_PROGRAM

PROGRAM _CYCLIC
	(* Insert code here *)
	//Data GEN
	msg := RandRange(0,10);
	
	//Data from DATABASE
	bExecuteRead;
	stDbReadQuery;
	
	//Para and button connect
	
	
	DT_TO_DTStructure(HMIAlarmQuerryStartTime,ADR(tstAlarmQuerryStartTime));
	
//	stDbReadQuery.stConfig.strStartTime[0] := '';
//	brsitoa(UINT_TO_UDINT(tstAlarmQuerryStartTime.year),ADR(strStartTimeYear));
//	
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryStartTime.month),ADR(strStartTimeMonth));
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryStartTime.day),ADR(strStartTimeDay));
//
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryStartTime.hour),ADR(strStartTimeHour));
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryStartTime.minute),ADR(strStartTimeMinute));
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryStartTime.second),ADR(strStartTimeSecond));
//
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(strStartTimeYear));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR('-'));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(strStartTimeMonth));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR('-'));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(strStartTimeDay));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(' '));
//	
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(strStartTimeHour));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(':'));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(strStartTimeMinute));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(':'));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strStartTime[0]),ADR(strStartTimeSecond));

	
	
	DT_TO_DTStructure(HMIAlarmQuerryEndTime,ADR(tstAlarmQuerryEndTime));
//	stDbReadQuery.stConfig.strEndTime[0] := '';
//	brsitoa(UINT_TO_UDINT(tstAlarmQuerryEndTime.year),ADR(strEndTimeYear));
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryEndTime.month),ADR(strEndTimeMonth));
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryEndTime.day),ADR(strEndTimeDay));
//
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryEndTime.hour),ADR(strEndTimeHour));
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryEndTime.minute),ADR(strEndTimeMinute));
//	brsitoa(USINT_TO_UDINT(tstAlarmQuerryEndTime.second),ADR(strEndTimeSecond));
//
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(strEndTimeYear));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR('-'));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(strEndTimeMonth));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR('-'));
//
//	
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(strEndTimeDay));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(' '));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(strEndTimeHour));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(':'));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(strEndTimeMinute));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(':'));
//	brsstrcat(ADR(stDbReadQuery.stConfig.strEndTime[0]),ADR(strEndTimeSecond));

	
	HMIAlarmQuerryMBBtn;
	
	//Response data
	HMIAlarmQuerryTimestr[0];
	HMIAlarmQuerryIndex[0];
	
END_PROGRAM

PROGRAM _EXIT
	(* Insert code here *)
	 
END_PROGRAM

