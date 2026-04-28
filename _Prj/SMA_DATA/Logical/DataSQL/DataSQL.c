
#include <bur/plctypes.h>

#ifdef _DEFAULT_INCLUDES
	#include <AsDefault.h>
#endif

void _INIT DataSQLInit(void)
{
	gDataSQLHeartBeat = 0;
}

void _CYCLIC DataSQLCyclic(void)
{
	//Í¨Ñ¶×´Ì¬¼ì²â
	TimerDataSQLComm.IN = !gDataSQLHeartBeat;
	TimerDataSQLComm.PT = 1000;
	TON_10ms(&TimerDataSQLComm);
	
	if(TimerDataSQLComm.Q)
	{
		gDataSQLCommFault = 1;
	}
	
	if(gDataSQLHeartBeat==1)
	{
		gDataSQLHeartBeat = 0;
	}
}

void _EXIT DataSQLExit(void)
{

}

