pragma solidity ^0.8.0;

import "./Dao.sol";
import "./Staking.sol";

contract DaoStaking is Dao, Staking {
    constructor(
        address chairPerson,
        uint256 _minimumQuorum,
        uint256 _debatingPeriodDuration,
        address _depositInstrumentAddress,
        address _rewardInstrumentAddress,
        uint256 _depositRatePercent,
        uint256 _maturityPeriosMin,
        uint256 _depositHoldTimeMin) 
    Dao(chairPerson, _minimumQuorum, _debatingPeriodDuration) 
    Staking(_depositInstrumentAddress, _rewardInstrumentAddress, _depositRatePercent, _maturityPeriosMin, _depositHoldTimeMin) {
        
    }

    function _canWithdrawal() internal override view returns (bool){
        return _lastProposalEndDate[msg.sender] <= block.timestamp;
    }

    function _balanceOf(address account) internal override view returns (uint256){
        return _deposits[msg.sender].amount;
    }
    
}
